import {createRequire } from "module";
const require = createRequire(import.meta.url);
let winax = require("winax");

import Process from "process";

/**
 *
 * @param {number} time
 * @returns {Promise<unknown>}
 */
let waitForMs = function (time = 1000) {
    return new Promise(function (onSuccess) {
        setTimeout(onSuccess, time);
    });
}

/**
 * Used in .ReadSpectrumData()
 * @type {{RUMP_RBS: number, IAEA_SPE: number, ASCII_CHANNELS_VS_COUNTS: number, ASCII_WITHOUT_CHANNELS: number, CANBERRA_AVA: number, FAST_COMTEC_MPA: number, ASCII_ENERGIES_VS_COUNTS: number, CANBERRA_CAM: number, MCERD: number, XNRA_OR_IDF: number, USER_DEFINED: number}}
 */
let SPECTRUM_FORMAT_ENUM = {
    ASCII_CHANNELS_VS_COUNTS: 1,
    CANBERRA_CAM: 2,
    RUMP_RBS: 4,
    USER_DEFINED: 5,
    MCERD: 6,
    ASCII_WITHOUT_CHANNELS: 7,
    ASCII_ENERGIES_VS_COUNTS: 8, // in keV
    XNRA_OR_IDF: 9,
    CANBERRA_AVA: 10,
    FAST_COMTEC_MPA: 11,
    IAEA_SPE: 13
}

/**
 * Used to specify which target type to use
 * @type {{TARGET: number, FOIL: number, WINDOW: number}}
 */
let TARGET_ID_ENUM = {
    TARGET: 1,
    FOIL: 2,
    WINDOW: 3
}

/**
 * Pads an element's name for use with SIMNRA
 * @param {string} someString
 */
let padElementName = function (someString) {
    if (typeof someString !== "string")
        throw new Error("String required");

    switch (someString.length) {
        case 1:
            return someString + " ";

        case 2:
            return someString;

        default:
            throw Error("Invalid length");
    }

}

/**
 * Bindings to the OLE interface of SIMNRA
 * @class
 */
class SIMNRAInstance {
    #Instance = {
        App: null,
        Target: null,
        Projectile: null,
        Setup: null,
        Stopping: null
    };
    #Running = true;
    Name = "None";

    /**
     * Path to an opened file (if any)
     * @type {string}
     */
    simnraFilePath = "";

    Stop () {
        // Leave it to the user to close this session
        this.#Instance.App.Show();
        winax.release(this.#Instance.App)
        winax.release(this.#Instance.Target)
    }

    /**
     *
     * @param {string} fsPath
     * @returns {Promise<boolean>}
     */
    async Open (fsPath) {
        //await waitForMs(500);

        this.simnraFilePath = fsPath;

        let Result = await this.#Instance.App.Open(fsPath, true);
        if (!Result)
            throw new Error(`Could not open SIMNRA file <${fsPath}>`);

        return true;
    }

    /**
     *
     * @param {string} fsPath - Will default to this.simnraFilePath
     * @param {number} [fileType=2]
     * @returns {Promise<boolean>}
     */
    async SaveAs (fsPath, fileType = 2) {
        if (!fsPath) {
            if (this.simnraFilePath)
                fsPath = this.simnraFilePath;
            else
                throw new InvalidTypeException("fsPath");
        }

        let Result = this.#Instance.App.SaveAs(fsPath, fileType);

        return !!Result;
    }

    /**
     *
     * @param {string} fsPath
     * @returns {Promise<boolean>}
     */
    async SaveTargetAs (fsPath) {
        let Result = this.#Instance.Target.SaveTargetAs(fsPath);

        return !!Result;
    }


    /**
     *
     * @param {string} fsPath
     * @param {number} format - See SPECTRUM_FORMAT_ENUM
     * @returns {Promise<boolean>}
     */
    async ReadSpectrumData (fsPath, format = SPECTRUM_FORMAT_ENUM.ASCII_CHANNELS_VS_COUNTS) {
        let Result = this.#Instance.Target.ReadSpectrumData(fsPath, format);

        return !!Result;
    }

    /**
     * Get the maximum analyzable depth
     * @returns {Promise<number>}
     */
    async getMaximumDepth () {
        let nLayers = await this.NumberOfLayers();

        let maxDepth = 0;
        let remainingEnergy = 0 + (this.#Instance.Setup.Energy);

        // Iterate through all layers until the remaining energy is stopped in a layer
        let layerIndex = 1; // 1 <= layerIndex <= nLayers
        let layerThickness = await this.LayerThickness(layerIndex); // 10^15 atoms/cm²
        let layerStopping = await this.StoppingInLayer(layerIndex); // keV / 10^15 atoms/cm²

        while (remainingEnergy - (layerThickness * layerStopping) >= 0) {
            maxDepth += layerThickness;
            remainingEnergy += - layerThickness * layerStopping;

            layerIndex++;
            layerThickness = await this.LayerThickness(layerIndex);
            layerStopping = await this.StoppingInLayer(layerIndex, remainingEnergy);
        }

        // The remaining energy is stopped in the current layer described by layerIndex, layerThickness and layerStopping
        maxDepth += remainingEnergy / layerStopping;

        return maxDepth;
    }

    /**
     * Integrates c_el*(layer thickness) for an element el until the maximum, analyzable depth given by incident ion energy, mass and charge
     * Uses the data from experiment options for the first layer and stopping data for all following layers to find the maximum depth
     * @param {string} elementName
     * @returns {Promise<number>}
     */
    async integrateElementUntilMaximumBulk (
        elementName
    ) {
        let remainingDepth = await this.getMaximumDepth();
        let integratedResult = 0;

        let layerIndex = 1;
        let layerThickness = await this.LayerThickness(layerIndex); // 10^15 atoms/cm²
        let layerElementConcentration = await this.ElementConcentration(layerIndex, elementName);

        while (remainingDepth - layerThickness >= 0) {
            integratedResult += layerThickness * layerElementConcentration;
            remainingDepth += - layerThickness;

            layerIndex++;
            layerThickness = await this.LayerThickness(layerIndex);
            layerElementConcentration = await this.ElementConcentration(layerIndex, elementName);
        }

        // The current layer given by layerIndex, ... is larger than remaining depth. Use only the remaining portion of it
        integratedResult += layerElementConcentration * remainingDepth;

        return integratedResult;
    }

    /**
     *
     * @param layerIndex
     * @param {number } [E] - Energy of the incident ion. Defaults to experiment settings
     * @param {number} [Z1] - Nuclear charge if the ion. Defaults to experiment settings
     * @param {number} [M1 - Mass of the incident ion. Defaults to experiment settings
     * @param {number} [targetID=TARGET_ID_ENUM.TARGET] - See TARGET_ID_ENUM
     * @returns {Promise<number>}
     */
    async StoppingInLayer (
        layerIndex,
        E = 0,
        Z1 = 0,
        M1 = 0,
        targetID = TARGET_ID_ENUM.TARGET
    ) {
        if (Z1 === 0)
            Z1 = 0 + this.#Instance.Projectile.Charge;

        if (M1 === 0)
            M1 = 0 + this.#Instance.Projectile.Mass;

        if (E === 0)
            E = 0 + this.#Instance.Setup.Energy;

        console.log(`Stopping <${E}> <${Z1}> <${M1}>`);

        let Result = 0 + this.#Instance.Stopping.StoppingInLayer(Z1, M1, E, targetID, layerIndex);

        return Result;
    }

    WriteSpectrumData (fsPathResult) {
        this.#Instance.App.WriteSpectrumData(fsPathResult);
    }

    /**
     *
     * @param {number} layerIndex
     * @param {string} elementName
     * @returns {Promise<boolean>}
     */
    async targetLayerIncludesElement (layerIndex, elementName) {
        return (-1 !== (await this.targetLayerGetElementIndex(layerIndex, elementName)));
    }

    /**
     * SIMNRA builds the target structure on element indices (not their names). We need to loop through all of them to check
     * @param {number} layerIndex
     * @param {string} elementName - Name of the element to find
     * @returns {Promise<number>} Returns -1 if an element is not included
     */
    async targetLayerGetElementIndex (layerIndex, elementName) {
        let nElements = await this.NumberOfElements(layerIndex);

        elementName = padElementName(elementName);

        for (let elementIndex = 1; elementIndex <= nElements; elementIndex++) {
            if ((await this.ElementName(layerIndex, elementIndex)) === elementName)
                return elementIndex;
        }

        return -1;
    }

    /**
     * Get the concentration of a given element
     * @param {number} layerIndex
     * @param {string|number} element - Accepts either an elementName or elementIndex inside the layer
     * @returns {Promise<number>}
     */
    async ElementConcentration (layerIndex, element) {
        let elementIndex;
        if (typeof element === "string") {
            elementIndex = await this.targetLayerGetElementIndex(layerIndex, element);
            if (elementIndex === -1)
                return 0;
        } else
            elementIndex = element;

        let Result = + this.#Instance.Target.ElementConcentration(layerIndex, elementIndex);

        return Result;
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<*>}
     */
    async ElementConcentrationArray (layerIndex) {
        return this.#Instance.Target.ElementConcentrationArray(layerIndex);
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @param {number} elementIndex - Starting from 1
     * @returns {Promise<string>}
     */
    async ElementName (layerIndex, elementIndex) {
        return this.#Instance.Target.ElementName(layerIndex, elementIndex);
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<number>} - An integer
     */
    async NumberOfElements (layerIndex) {
        let Result = + this.#Instance.Target.NumberOfElements(layerIndex);

        return Result;
    }

    /**
     *
     * @returns {Promise<number>} - An integer
     */
    async NumberOfLayers () {
        let Result = + this.#Instance.Target.NumberOfLayers;

        return Result;
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<boolean>}
     */
    async HasLayerRoughness (layerIndex) {
        let Result = this.#Instance.Target.HasLayerRoughness(layerIndex);

        return !!Result;
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<number>} - A double, representing roughness FWHM
     */
    async LayerRoughness (layerIndex) {
        let Result = + this.#Instance.Target.LayerRoughness(layerIndex);

        return Result;
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<number>} - A double, in 10^15 atoms/cm²
     */
    async LayerThickness (layerIndex) {
        let Result = + this.#Instance.Target.LayerThickness(layerIndex);

        return Result;
    }

    /**
     *
     * @param {string} Name
     */
    constructor(
        Name
    ) {
        let This = this;

        this.Name = Name;

        this.#Instance = {};
        this.#Instance.App = new winax.Object("Simnra.App");
        this.#Instance.Target = new winax.Object("Simnra.Target");
        this.#Instance.Setup = new winax.Object("Simnra.Setup");
        this.#Instance.Projectile = new winax.Object("Simnra.Projectile");
        this.#Instance.Stopping = new winax.Object("Simnra.Stopping");

        /**
         * __vars
         * __methods
         * __type
         * __id
         *
         * --> __methods
         */
        //console.log(Object.keys(this.#Instance.__methods));

        Process.on("exit", function () {
            if (This.#Running)
                This.Stop();
        });
    }
}

export default SIMNRAInstance;
export {
    SPECTRUM_FORMAT_ENUM,
    TARGET_ID_ENUM,
    waitForMs
}
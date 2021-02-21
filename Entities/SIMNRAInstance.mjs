import {createRequire } from "module";
const require = createRequire(import.meta.url);
let winax = require("winax");

import Process from "process";

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
 * Bindings to the OLE interface of SIMNRA
 * @class
 */
class SIMNRAInstance {
    #Instance = {
        App: null,
        Target: null
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
     * @param fsPath
     * @returns {Promise<void>}
     */
    async Open (fsPath) {
        //await waitForMs(500);

        this.simnraFilePath = fsPath;

        this.#Instance.App.Open(fsPath, true);
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
     * @param {number} format - See SPECTRUM_FORMAT_ENUM
     * @returns {Promise<boolean>}
     */
    async ReadSpectrumData (fsPath, format = SPECTRUM_FORMAT_ENUM.ASCII_CHANNELS_VS_COUNTS) {
        let Result = this.#Instance.App.ReadSpectrumData(fsPath, format);

        return !!Result;
    }

    WriteSpectrumData (fsPathResult) {
        this.#Instance.App.WriteSpectrumData(fsPathResult);
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
        return this.#Instance.Target.NumberOfElements(layerIndex);
    }

    /**
     *
     * @returns {Promise<number>} - An integer
     */
    async NumberOfLayers () {
        return this.#Instance.Target.NumberOfLayers;
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<boolean>}
     */
    async HasLayerRoughness (layerIndex) {
        return this.#Instance.Target.HasLayerRoughness(layerIndex);
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<number>} - A double, representing roughness FWHM
     */
    async LayerRoughness (layerIndex) {
        return this.#Instance.Target.LayerRoughness(layerIndex);
    }

    /**
     *
     * @param {number} layerIndex - Starting from 1
     * @returns {Promise<number>} - A double, in 10^15 atoms/cm²
     */
    async LayerThickness (layerIndex) {
        return this.#Instance.Target.LayerThickness(layerIndex);
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
    SPECTRUM_FORMAT_ENUM
}
import csv from "csv";

import AccessDeniedException from "../../xdms3/lib/Entities/Exceptions/AccessDeniedException.mjs";
import InvalidTypeException from "../../xdms3/lib/Entities/Exceptions/InvalidTypeException.mjs";
import UniquenessViolationException from "../../xdms3/lib/Entities/Exceptions/UniquenessViolationException.mjs";
import NotFoundException from "../../xdms3/lib/Entities/Exceptions/NotFoundException.mjs";

import {ObjectList} from "../../xdms3/lib/Entities/ObjectList.mjs";
import SCHController from "../../Entities/Network/SCHController.mjs";
import ClientServicingCommand from "../../Entities/ClientServicingCommand.js";

import SpectrumExport from "../Managed/SpectrumExport.mjs";
import SpectrumExportRepository from "../Managed/Repository/SpectrumExportRepository.mjs";
import SIMNRALayerRepository from "../Managed/Repository/SIMNRALayerRepository.mjs";
import SIMNRALayerPartRepository from "../Managed/Repository/SIMNRALayerPartRepository.mjs";

import {
	SpectrumAnalysisExportAllLayerConcentration,
	SpectrumAnalysisExportFirstLayerData,
	SpectrumAnalysisExportThicknessesUntilPrevalenceReached,
	SpectrumAnalysisExportPrevalenceSumUntilThicknessReached
} from "../Dedicated/SIMNRAService.mjs";

import {createRequire } from "module";
const require = createRequire(import.meta.url);
let winax = require("winax");

import FS from "fs";
import Process from "process";
import Path from "path";
import RXI from "../../genetix-server.js";
import FSBSShared from "../../Services/FSBS/Entities/FSBSShared.js";
import FileSystemWatcher, {FileSystemWatcherInterface} from "../../Entities/Filesystem/FileSystemWatcher.mjs";

import SIMNRALayer from "../Managed/SIMNRALayer.mjs";
import SIMNRALayerPart from "../Managed/SIMNRALayerPart.mjs";

let FSBSTools = FSBSShared.FSBSTools;

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

class SIMNRATarget {

}

class SIMNRAApp {

}

class SIMNRAInstance {
	#Instance = {
		App: null,
		Target: null
	};
	#Running = true;
	Name = "None";

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

		this.#Instance.App.Open(fsPath, true);
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

class SIMNRAServiceController extends SCHController {
	#Instances = new ObjectList(SIMNRAInstance, "Name");

	#rootDir = "";

	#doExports = {
		onStart: true,
		onUpdate: true
	}

	/**
	 *
	 * @type {FileSystemWatcherInterface}
	 */
	#fsWatcher = null;

	/**
	 *
	 * @type {SpectrumExportRepository}
	 */
	#spectrumExportRepository = null;

	/**
	 * @type {SIMNRALayerRepository}
	 */
	#simnraLayerRepository = null;

	/**
	 * @type {SIMNRALayerPartRepository}
	 */
	#simnraLayerPartRepository = null;

	/**
	 *
	 * @param {string} rootDir
	 * @param {object} doExports
	 * @param {boolean} doExports.onStart - Exports all spectra on start of this controller
	 * @param {boolean} doExports.onUpdate - Exports a spectrum when an XNRA file is changed
	 * @param {SpectrumExportRepository} spectrumExportRepository
	 * @param {SIMNRALayerRepository} simnraLayerRepository
	 * @param {SIMNRALayerPartRepository} simnraLayerPartRepository
	 */
	constructor(
		{ rootDir, doExports },
		spectrumExportRepository,
		simnraLayerRepository,
		simnraLayerPartRepository
	) {
		super("SIMNRA", [
			new ClientServicingCommand("startInstanceAction", async function (Socket, requestData) {
				if (!await This.isGranted(Socket.userSession, "groupAdministrators"))
					throw new AccessDeniedException();

				if (typeof requestData.Name !== "string")
					throw new InvalidTypeException("Name");

				let cInstance = This.#Instances.findBy(requestData.Name);
				if (cInstance)
					throw new UniquenessViolationException("Name");
				else {
					cInstance = new SIMNRAInstance(requestData.Name);
					This.#Instances.push(cInstance);
				}

				return true;
			}),
			new ClientServicingCommand("stopInstanceAction", async function (Socket, requestData) {
				if (!await This.isGranted(Socket.userSession, "groupAdministrators"))
					throw new AccessDeniedException();

				if (typeof requestData.Name !== "string")
					throw new InvalidTypeException("Name");

				/**
				 * @type {SIMNRAInstance}
				 */
				let cInstance = This.#Instances.findBy(requestData.Name);
				if (!cInstance)
					throw new NotFoundException(`Instance <${requestData.Name}>`);

				cInstance.Stop();

				This.#Instances.removeObj(cInstance);

				return true;
			})
		]);

		if (!(rootDir instanceof Array))
			rootDir = [rootDir];

		rootDir.unshift(RXI.Root);

		this.#rootDir = Path.join.apply(null, rootDir);
		this.#doExports = doExports;
		this.#spectrumExportRepository = spectrumExportRepository;
		this.#simnraLayerRepository = simnraLayerRepository;
		this.#simnraLayerPartRepository = simnraLayerPartRepository;

		let This = this;
	}

	/**
	 * Called when performExports is running
	 * @type {boolean}
	 */
	#exportRunning = false;

	/**
	 * If set to true, performExports will re-run after its current/next execution. On the next run, this will be set to false first
	 * @type {boolean}
	 */
	#exportPending = false;

	/**
	 * Searches
	 * @param {boolean} doRecursive
	 * @returns {Promise<boolean>} - True if any spectrum files changed
	 */
	async performExports (doRecursive = false) {
		this.#exportRunning = true;

		let reexecuteOnEnd = !!this.#exportPending;
		// Set exportPending to false
		this.#exportPending = false;

		let SIMNRAfiles = [];

		let This = this;

		/**
		 * A helper function for asynchronically iterating through folder trees
		 * @param {string} someDir
		 * @param {boolean} doRecursive
		 * @returns {Promise<boolean>}
		 */
		let searchDir = async function (
			someDir,
			doRecursive
		) {
			let fsContent = await FSBSTools.listDirAdv(someDir);
			if (doRecursive)
				await Promise.all(fsContent.Directories.map((fsDirectory) => searchDir(
					Path.join(someDir, fsDirectory),
					doRecursive
				)));

			let xnraFiles = fsContent.Files.filter((fsFileName) => fsFileName.toLowerCase().endsWith(".xnra"));
			for (let fsElement of xnraFiles)
				SIMNRAfiles.push(Path.join(someDir, fsElement));

			return true;
		}

		await searchDir(this.#rootDir, doRecursive);

		/**
		 *
		 * @type {SpectrumExport[]}
		 */
		let spectrumExportsUpdated = [];

		await Promise.all(SIMNRAfiles.map(async function (filePath) {
			/**
			 * @type {SpectrumExport}
			 */
			let spectrumExport = await This.#spectrumExportRepository.findByFsPath(filePath);

			/**
			 *
			 * @type {{Size: number, timeCreation: number, timeModification: number, timeAccess: number}}
			 */
			let fileInfo = await FSBSTools.fileInfo(filePath);

			let changedAtFile = Math.round(fileInfo.timeModification);

			if (spectrumExport) {
				if (changedAtFile > spectrumExport.changedAt.getTime()) {
					// FILE CHANGED
					spectrumExport = await SpectrumExport.query().findOne("id", spectrumExport.id);
					spectrumExport = await spectrumExport.$query().updateAndFetch({ changedAt: new Date(changedAtFile) });

					spectrumExportsUpdated.push(spectrumExport);
				} else {
					// FILE UNCHANGED
					return true;
				}
			} else {
				// Save modification date
				spectrumExport = await This.#spectrumExportRepository.createEntity(filePath, new Date(changedAtFile));
				spectrumExportsUpdated.push(spectrumExport);
			}

			return true;
		}));

		console.log(`Exporting <${spectrumExportsUpdated.length}> files`);

		// NEW: Execute items one after another
		for (let spectrumExport of spectrumExportsUpdated) {
			/**
			 * @type {string}
			 */
			let filePathIn = spectrumExport.fsPath;

			/**
			 * @type {SIMNRAInstance}
			 */
			let mainInstance = This.#Instances.findBy("Main");
			if (!mainInstance) {
				mainInstance = new SIMNRAInstance("Main");
				This.#Instances.push(mainInstance);
			}

			let datDir = Path.join(Path.dirname(filePathIn), "dat"),
				filePathOut = Path.join(datDir, Path.basename(filePathIn).replace(".xnra", ".dat"));

			if (!await FSBSTools.isDir(datDir))
				await FSBSTools.mkDir(datDir);

			await mainInstance.Open(filePathIn);

			mainInstance.WriteSpectrumData(filePathOut);

			// Compare saved layers with current layers
			let layerAmount = await mainInstance.NumberOfLayers();

			let layerIndices = [];
			for (let layerIndex = 1; layerIndex <= layerAmount; layerIndex++)
				layerIndices.push(layerIndex);

			console.log(`Logging <${layerIndices.length}> layers of spectrum <${filePathIn}>`);

			await Promise.all(layerIndices.map(async function (layerIndex) {
				let layerHasRoughness = await mainInstance.HasLayerRoughness(layerIndex);

				/**
				 * @type {{spectrumId: number, index: number}}
				 */
				let searchObject = {
					spectrumId: spectrumExport.id,
					index: layerIndex
				}

				let layerObject = {
					thickness: await mainInstance.LayerThickness(layerIndex),
					roughnessGammaFWHM: layerHasRoughness ? (await mainInstance.LayerRoughness(layerIndex)) : 0
				}

				/**
				 * @type {SIMNRALayer}
				 */
				let layerInstance = await SIMNRALayer.query().findOne(searchObject);

				// Update / Insert new layer with required content
				if (layerInstance)
					layerInstance = await layerInstance.$query().updateAndFetch(layerObject);
				else
					layerInstance = await SIMNRALayer.query().insertAndFetch(Object.assign({}, searchObject, layerObject));

				// Now add SIMNRALayerPart items
				let layerElementAmount = await mainInstance.NumberOfElements(layerIndex);
				let layerElementIndices = [];
				for (let layerElementIndex = 1; layerElementIndex <= layerElementAmount; layerElementIndex++)
					layerElementIndices.push(layerElementIndex);

				let layerConcentrationArray = await mainInstance.ElementConcentrationArray(layerIndex);

				let layerElementNames = await Promise.all(layerElementIndices.map(async function (layerElementIndex) {
					let layerElementName = await mainInstance.ElementName(layerIndex, layerElementIndex);

					let layerElementConcentration = layerConcentrationArray[layerElementIndex - 1];

					let cSearchObject = {
						layerId: layerInstance.id,
						elementName: layerElementName
					}

					let cLayerPartObject = {
						elementConcentration: layerElementConcentration
					}

					console.log(`${typeof layerElementConcentration} <> ${layerElementConcentration}`);

					/**
					 * @type {SIMNRALayerPart}
					 */
					let layerPartInstance = await SIMNRALayerPart.query().findOne(cSearchObject);
					if (layerPartInstance)
						layerPartInstance = await layerPartInstance.$query().updateAndFetch(cLayerPartObject);
					else
						layerPartInstance = await SIMNRALayerPart.query().insertAndFetch(Object.assign({}, cSearchObject, cLayerPartObject));

					return layerElementName;
				}));

				// Delete layer part with layerIndex > layerAmount
				await SIMNRALayerPart.query().whereNotIn("elementName", layerElementNames).andWhere({ layerId: layerInstance.id }).delete();

				return true;
			}));

			// Delete layers with layerIndex > layerAmount
			await SIMNRALayer.query().whereNotBetween("index", [1, layerAmount]).andWhere({ spectrumId: spectrumExport.id }).delete();

			await waitForMs(100);
		}

		if (reexecuteOnEnd)
			await this.performExports(doRecursive);

		this.#exportRunning = false;

		return spectrumExportsUpdated.length > 0;
	}

	async Init () {
		let This = this;

		if (this.#doExports.onStart)
			await this.performExports(true);

		let spectrumAnalysisExports = [
			 new SpectrumAnalysisExportFirstLayerData(
			 	"FeW-ColllectionAll-Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-01_FeW_Si-1_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-05_FeW_Si-1_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-09_FeW_Si-1_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-13_FeW_Si305_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-14_FeW_Si-307-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-16_FeW_Si-310_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-18_FeW_Si305_1MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-19_FeW_Si-307-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-21_FeW_Si-310_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-23_FeW_Si305_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-24_FeW_Si-307-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-31_FeW_Si-309_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-35_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-36_FeW_Si-309_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-40_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-45_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-50_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-54_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-60_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-65_FeW_Si-4_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-70_FeW_Si-4_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-75_FeW_Si-4_4MeV#1.xnra"
				]
			 ),
			new SpectrumAnalysisExportFirstLayerData(
				"FeW-All-CollectionPolarAll-Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-01_FeW_Si-1_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-05_FeW_Si-1_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-09_FeW_Si-1_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-13_FeW_Si305_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-14_FeW_Si-307-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-21_FeW_Si-310_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-23_FeW_Si305_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-24_FeW_Si-307-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-31_FeW_Si-309_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-40_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-45_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-54_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-70_FeW_Si-4_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-75_FeW_Si-4_4MeV#1.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-18_FeW_Si305_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-16_FeW_Si-310_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-19_FeW_Si-307-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-35_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-36_FeW_Si-309_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-50_FeW_Si-2_4MeV-10uC.xnra", // 20
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-50_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-60_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-60_FeW_Si306_1MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-65_FeW_Si-4_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-65_FeW_Si306_4MeV#1.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-C layers\\r-55_FeW_C-3-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-C layers\\r-55_FeW_C-4_4MeV#1c2.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-C layers\\r-60_FeW_C-4_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-C layers\\r-65_FeW_C-4_4MeV#1.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe layers\\r-29_p-71_FeW_Fe20-69-i_4MeV.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe layers\\r-34_p-76_FeW_Fe20-69-i_4MeV.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe layers\\r-39_p-81_FeW_Fe20-69-i_4MeV.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe layers\\r-29_p-55_FeW_Fe20-66-i_4MeV.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe layers\\r-34_p-60_FeW_Fe20-66-i_4MeV.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe layers\\r-39_p-65_FeW_Fe20-66-i_4MeV.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe layers\\r-30-FeW_Fe20-67-i_4MeV#1c1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe layers\\r-35-FeW_Fe20-67-i_4MeV#1.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe layers\\r-18-FeW_Fe20-14-i_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe layers\\r-22-FeW_Fe20-14-i_4MeV#1.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Fe layers\\r-14_FeW_Fe20-17-i-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Fe layers\\r-19_FeW_Fe20-17-i-4MeV_10uC.xnra",

					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe layers\\r-30_FeW_Fe20-02-i_4MeV#1c1.xnra"
				]
			),
			new SpectrumAnalysisExportFirstLayerData(
				"FeW-Si-ColllectionPolarAll-Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-18_FeW_Si305_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-16_FeW_Si-310_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-19_FeW_Si-307-4MeV_10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-35_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-36_FeW_Si-309_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-50_FeW_Si-2_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-50_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-60_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-60_FeW_Si306_1MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-65_FeW_Si-4_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-65_FeW_Si306_4MeV#1.xnra"
				]
			),
			new SpectrumAnalysisExportFirstLayerData(
				"FeW-Si-ColllectionPolar-ComparisonA",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-18_FeW_Si305_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-16_FeW_Si-310_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-19_FeW_Si-307-4MeV_10uC.xnra",
				]
			),
			new SpectrumAnalysisExportFirstLayerData(
				"FeW-Si-ColllectionPolar-ComparisonB",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-35_FeW_Si308_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-36_FeW_Si-309_4MeV-10uC.xnra",
				]
			),
			new SpectrumAnalysisExportFirstLayerData(
				"FeW-Si-ColllectionPolar-ComparisonC",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 a\\FeW-Si layers\\r-50_FeW_Si-2_4MeV-10uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-50_FeW_Si-3_4MeV#1.xnra",
				]
			),
			new SpectrumAnalysisExportFirstLayerData(
				"FeW-Si-ColllectionPolar-ComparisonD",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-60_FeW_Si-3_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-60_FeW_Si306_1MeV#1.xnra",
				]
			),
			new SpectrumAnalysisExportFirstLayerData(
				"FeW-Si-ColllectionPolar-ComparisonE",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-65_FeW_Si-4_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Si layers\\r-65_FeW_Si306_4MeV#1.xnra"
				]
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-65-800K-3h-200eV_normalFlux_pos32_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe mod D beam normalFlux\\r-39_p-32_FeW_Fe20-65-800K-3h-200eV_normalFlux_4MeV_45uC.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-65-800K-3h-200eV_normalFlux_pos28_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe mod D beam normalFlux\\r-35_p-28_FeW_Fe20-65-800K-3h-200eV_normalFlux_4MeV_45uC.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-67-800K-3h-200eV_reducedFlux_pos49_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe mod D beam reducedFlux\\r-38_p-49_FeW_Fe20-67-800K-3h-200eV_reducedFlux_4MeV_45uC.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-67-i_r30_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe layers\\r-30-FeW_Fe20-67-i_4MeV#1c1.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-69-i_r34_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\August 2020\\FeW-Fe layers\\r-34_p-76_FeW_Fe20-69-i_4MeV.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-18-800K-3h_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe mod layers\\r-16-FeW_Fe20-18-800K-3h_4MeV#1.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-15-800K-60h_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-31_FeW_Fe20-15-800K-60h_4MeV_30uC.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-10-830K-3h_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-31_FeW_Fe20-10-830K-3h_4MeV_30uC#001.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-13-900K-3h_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-20_FeW_Fe20-13-900K-3h_4MeV_30uC#001.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportAllLayerConcentration(
				"Fe20-14-1200K-2h_W",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-23_FeW_Fe20-14-1200K-2h_4MeV_10uC.xnra",
				"W",
				true
			),
			new SpectrumAnalysisExportPrevalenceSumUntilThicknessReached(
				"SpectrumAnalysisExportPrevalenceSumUntilThicknessReached180",
				"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				[
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe mod layers\\r-16-FeW_Fe20-18-800K-3h_4MeV#1.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-31_FeW_Fe20-15-800K-60h_4MeV_30uC.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-31_FeW_Fe20-10-830K-3h_4MeV_30uC#001.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-20_FeW_Fe20-13-900K-3h_4MeV_30uC#001.xnra",
					"E:\\DevRepositories\\genetix-server\\SIMNRAroot\\June 2020 b\\FeW-Fe mod heated\\r-23_FeW_Fe20-14-1200K-2h_4MeV_10uC.xnra"//, "E:\\DevRepositories\\genetix-server\\SIMNRAroot\\March 2020\\FeW-Fe layers\\r-30-FeW_Fe20-67-i_4MeV#1c1.xnra"
				],
				[
					"800K 3h",
					"800K 60h",
					"830K 3h",
					"900K 3h",
					"1200K 2h"//, "initial",
				],
				"W",
				180
			),

		];

		if (this.#doExports.onUpdate) {
			let onUpdate = async function (evtName, fullPath) {
				console.log(evtName);

				// FOR NOW, THIS IS JUST A DUMB CALL TO performExports !!!
				console.log("Re-issuing export...");
				let spectrumUpdated = false;
				if (This.#exportRunning)
					This.#exportPending = true;
				else {
					spectrumUpdated = await This.performExports(true);
					spectrumUpdated = spectrumUpdated || evtName === "FORCE";

					if (spectrumUpdated)
						console.log("Re-export succeeded");
					else
						console.log("Nothing to re-export");
				}

				await Promise.all(spectrumAnalysisExports.map(async function (spectrumAnalysis) {
					if (!spectrumUpdated)
						return;

					let spectrumAnalysisFiles = spectrumAnalysis.Files;

					if (spectrumAnalysis instanceof SpectrumAnalysisExportFirstLayerData) {
						/**
						 *
						 * @type {{"O ": null, r: number, d: number, "W ": null, Fe: null}[]}
						 */
						let layerConcentrations = await Promise.all(spectrumAnalysisFiles.map(async function (spectrumExportPath) {
							let spectrumExport = await SpectrumExport.query().findOne({
								fsPath: spectrumExportPath
							}).withGraphFetched("Layers.[Parts]");

							/**
							 * @type {SIMNRALayer}
							 */
							let layer = spectrumExport.Layers.filter((layer) => layer.index === 1).pop();

							/**
							 * @type {string}
							 */
							let splitPart = spectrumExportPath.split("r-")[1];

							/**
							 * @type {number}
							 */
							let radius = +(splitPart.includes("_p-") ? splitPart.split("_p-")[0] : (splitPart.includes("_FeW") ? splitPart.split("_FeW")[0] : splitPart.split("-FeW")[0]));

							let concentrations = {
								"Fe": null,
								"W ": null,
								"O ": null
							}

							// NEW: Conversion to at. %
							for (let layerPart of layer.Parts)
								concentrations[layerPart.elementName] = layerPart.elementConcentration * 100;

							return {...concentrations, r: radius, d: layer.thickness}
						}));

						/**
						 * NEW: Save contents to CSV file linked in OriginLab
						 */

						let csvData = layerConcentrations.map((entry) => [entry.r, entry.Fe, entry["W "], entry["O "], entry.d]);

						// Add header
						csvData.unshift([
							"mm", "at %", "at %", "at %", "10^15 atoms/cm²"
						]);
						csvData.unshift([
							"r", "c_Fe", "c_W", "c_O", "d"
						]);

						console.log(spectrumAnalysis.Name, csvData);

						csv.stringify(csvData, {delimiter: `;`}, (e, output) => {
							FS.writeFileSync(Path.join(spectrumAnalysis.Output, spectrumAnalysis.Name + ".csv"), output);
						});
					} else if (spectrumAnalysis instanceof SpectrumAnalysisExportAllLayerConcentration) {
						let spectrumExport = await SpectrumExport.query().findOne({
							fsPath: spectrumAnalysis.Files[0]
						}).withGraphFetched("Layers.[Parts]");

						/**
						 * @type {SIMNRALayer[]}
						 */
						let layers = spectrumExport.Layers.sort((a,b) => a.index-b.index);

						let layerData = layers
							.filter((layer, elIndex) => (!spectrumAnalysis.layerIndicesToIgnore.includes(layer.index) && !(spectrumAnalysis.ignoreLast && elIndex === layers.length - 1)))
							.map(function (layer) {
								let c = null;
								for (let layerPart of layer.Parts) {
									if (layerPart.elementName === spectrumAnalysis.elementName)
										c = layerPart.elementConcentration * 100;
								}

								return {
									d: layer.thickness,
									di: layer.thickness,
									g: layer.roughnessGammaFWHM,
									c,
									i: layer.index
								};
							});

						if (spectrumAnalysis.insertLayer) {
							layerData.unshift({
								d: 0,
								di: 0,
								g: 0,
								c: 0,
								i: 0
							});
						}

						// integrate per default
						for (let layerIndex = 1; layerIndex < layerData.length; layerIndex++)
							layerData[layerIndex].di += layerData[layerIndex - 1].di;

						let csvData = layerData.map((entry) => [entry.i, entry.d, entry.di, entry.g, entry.c]);

						// Add header
						csvData.unshift([
							"", "10^15 atoms/cm²", "10^15 atoms/cm²", "", "at %"
						]);
						csvData.unshift([
							"i", "d", "d_i", "Gamma_FHWM", `c_${spectrumAnalysis.elementName}`
						]);

						console.log(spectrumAnalysis.Name, csvData);

						csv.stringify(csvData, {delimiter: `;`}, (e, output) => {
							FS.writeFileSync(Path.join(spectrumAnalysis.Output, spectrumAnalysis.Name + ".csv"), output);
						});
					} else if (spectrumAnalysis instanceof SpectrumAnalysisExportThicknessesUntilPrevalenceReached) {
						/**
						 *
						 * @type {{name: string, d_f: number}[]}
						 */
						let layerConcentrations = await Promise.all(spectrumAnalysisFiles.map(async function (spectrumExportPath, index) {
							let spectrumExport = await SpectrumExport.query().findOne({
								fsPath: spectrumExportPath
							}).withGraphFetched("Layers.[Parts]");

							/**
							 * @type {SIMNRALayer[]}
							 */
							let layers = spectrumExport.Layers.sort((a,b) => a.index-b.index);

							let fullPrevalence = 0;
							for (let layer of layers) {
								for (let layerPart of layer.Parts) {
									if (layerPart.elementName === spectrumAnalysis.elementName)
										fullPrevalence += (layerPart.elementConcentration * layer.thickness);
								}
							}

							let lastFraction = 0;
							let sum = 0;

							for (let layer of layers) {
								/**
								 * @type {SIMNRALayerPart|null}
								 */
								let layerPart = null;
								for (layerPart of layer.Parts) {
									if (layerPart.elementName === spectrumAnalysis.elementName)
										break;
								}

								if (layerPart) {
									let currentPrevalence = layerPart.elementConcentration * layer.thickness;

									if ((lastFraction + currentPrevalence/fullPrevalence) > spectrumAnalysis.thresholdFraction) {
										sum += (spectrumAnalysis.thresholdFraction - lastFraction) * fullPrevalence / layerPart.elementConcentration;
										break;
									} else {
										lastFraction += currentPrevalence/fullPrevalence;
										sum += layer.thickness;
									}

								}
							}

							let name = spectrumAnalysis.Names[index];

							return { name, d_f: sum }
						}));
						/**
						 * NEW: Save contents to CSV file linked in OriginLab
						 */

						let csvData = layerConcentrations.map((entry) => [entry.name, entry.d_f]);

						// Add header
						csvData.unshift([
							"", "10^15 atoms/cm²"
						]);
						csvData.unshift([
							"Name", "d_f"
						]);

						console.log(spectrumAnalysis.Name, csvData);

						csv.stringify(csvData, {delimiter: `;`}, (e, output) => {
							FS.writeFileSync(Path.join(spectrumAnalysis.Output, spectrumAnalysis.Name + ".csv"), output);
						});
					} else if (spectrumAnalysis instanceof SpectrumAnalysisExportPrevalenceSumUntilThicknessReached) {
						/**
						 *
						 * @type {{name: string, d_f: number}[]}
						 */
						let layerConcentrations = await Promise.all(spectrumAnalysisFiles.map(async function (spectrumExportPath, index) {
							let spectrumExport = await SpectrumExport.query().findOne({
								fsPath: spectrumExportPath
							}).withGraphFetched("Layers.[Parts]");

							/**
							 * @type {SIMNRALayer[]}
							 */
							let layers = spectrumExport.Layers.sort((a,b) => a.index-b.index);

							let fullPrevalence = 0;
							for (let layer of layers) {
								for (let layerPart of layer.Parts) {
									if (layerPart.elementName === spectrumAnalysis.elementName)
										fullPrevalence += (layerPart.elementConcentration * layer.thickness);
								}
							}

							let lastDepth = 0;
							let sum = 0;

							for (let layer of layers) {
								/**
								 * @type {SIMNRALayerPart|null}
								 */
								let layerPart = null;
								for (layerPart of layer.Parts) {
									if (layerPart.elementName === spectrumAnalysis.elementName)
										break;
								}

								if (layerPart) {
									let currentPrevalence = layerPart.elementConcentration * layer.thickness;

									if ((lastDepth + layer.thickness) > spectrumAnalysis.thresholdThickness) {
										sum += ((spectrumAnalysis.thresholdThickness - lastDepth) * layerPart.elementConcentration)/fullPrevalence;
										break;
									} else {
										lastDepth += layer.thickness;
										sum += currentPrevalence/fullPrevalence;
									}

								}
							}

							let name = spectrumAnalysis.Names[index];

							return { name, p_f: sum }
						}));

						let csvData = layerConcentrations.map((entry) => [entry.name, entry.p_f]);

						// Add header
						csvData.unshift([
							"", "10^15 atoms/cm²"
						]);
						csvData.unshift([
							"Name", "p_f"
						]);

						console.log(spectrumAnalysis.Name, csvData);

						csv.stringify(csvData, {delimiter: `;`}, (e, output) => {
							FS.writeFileSync(Path.join(spectrumAnalysis.Output, spectrumAnalysis.Name + ".csv"), output);
						});
					}
				}));

			}

			this.#fsWatcher = new FileSystemWatcher(this.#rootDir, {
				onChange: onUpdate,
				onAdd: onUpdate
			});

			console.log(this.#fsWatcher);

			await onUpdate("FORCE");
			await this.#fsWatcher.Start();
		}

		return true;
	}
}

export default SIMNRAServiceController;
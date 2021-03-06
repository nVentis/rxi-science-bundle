import csv from "csv";

import AccessDeniedException from "../../xdms3/lib/Entities/Exceptions/AccessDeniedException.mjs";
import InvalidTypeException from "../../xdms3/lib/Entities/Exceptions/InvalidTypeException.mjs";
import UniquenessViolationException from "../../xdms3/lib/Entities/Exceptions/UniquenessViolationException.mjs";
import NotFoundException from "../../xdms3/lib/Entities/Exceptions/NotFoundException.mjs";

import {ObjectList} from "../../xdms3/lib/Entities/ObjectList.mjs";
import SCHController from "../../Entities/Network/SCHController.mjs";
import ClientServicingCommand from "../../Entities/ClientServicingCommand.js";

import SpectrumExport from "../Managed/SpectrumExport.mjs";
import SIMNRAInstance from "../Entities/SIMNRAInstance.mjs";
import SpectrumExportRepository from "../Managed/Repository/SpectrumExportRepository.mjs";
import SIMNRALayerRepository from "../Managed/Repository/SIMNRALayerRepository.mjs";
import SIMNRALayerPartRepository from "../Managed/Repository/SIMNRALayerPartRepository.mjs";

import {createRequire } from "module";
const require = createRequire(import.meta.url);
let winax = require("winax");

import FS from "fs";
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

		let layerProfileGroups = [
			{
				Name: "FeW-Si-ColllectionAll-Comparison",
				Output: "E:\\DevRepositories\\genetix-server\\SIMNRAroot\\Comparison",
				Files: [
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
			}
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

				await Promise.all(layerProfileGroups.map(async function (spectrumGroup) {
					if (!spectrumUpdated)
						return;

					let spectrumGroupFiles = spectrumGroup.Files;

					/**
					 *
					 * @type {{"O ": null, r: number, "W ": null, Fe: null}[]}
					 */
					let layerConcentrations = await Promise.all(spectrumGroupFiles.map(async function (spectrumExportPath) {
						let spectrumExport = await SpectrumExport.query().findOne({
							fsPath: spectrumExportPath
						}).withGraphFetched("Layers.[Parts]");

						/**
						 * @type {SIMNRALayer}
						 */
						let layer = spectrumExport.Layers.filter((layer) => layer.index === 1).pop();

						/**
						 * @type {number}
						 */
						let radius = +spectrumExportPath.split("r-")[1].split("_")[0];

						let concentrations = {
							"Fe": null,
							"W ": null,
							"O ": null
						}

						for (let layerPart of layer.Parts)
							concentrations[layerPart.elementName] = layerPart.elementConcentration;

						return {...concentrations, r: radius }
					}));

					/**
					 * NEW: Save contents to CSV file linked in OriginLab
					 */

					let csvData = layerConcentrations.map((entry) => [entry.r, entry.Fe, entry["W "], entry["O "]]);

					// Add header
					csvData.unshift([
						"mm", "10^15 atoms/cm²", "10^15 atoms/cm²", "10^15 atoms/cm²"
					]);
					csvData.unshift([
						"r", "c_Fe", "c_W", "c_O"
					]);

					console.log(csvData);

					csv.stringify(csvData, { delimiter: `;` }, (e, output) => {
						FS.writeFileSync(Path.join(spectrumGroup.Output, spectrumGroup.Name + ".csv"), output);
					});


					/** OLD: Create plotly object to render

					let traces = [
						{ x: [], y: [], stackgroup: "Fe" },
						{ x: [], y: [], stackgroup: "W" },
						{ x: [], y: [], stackgroup: "O" }
					];

					layerConcentrations.forEach((cEntry) => {
						traces[0].x.push(cEntry.r);
						traces[1].x.push(cEntry.r);
						traces[2].x.push(cEntry.r);

						traces[0].y.push(cEntry.Fe);
						traces[1].y.push(cEntry["W "]);
						traces[2].y.push(cEntry["O "]);
					})

					console.log(traces);*/


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
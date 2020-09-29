let spectrumAnalysisExportTypeEnum = {
	FirstLayerData: "FirstLayerData",
	AllLayerConcentration: "AllLayerConcentration"
}

const IGNORE_LAST_LAYER_PER_DEFAULT = true;

class SpectrumAnalysisExport {
	/**
	 * @param {string} Type - See spectrumAnalysisExportTypeEnum
	 * @param {string} Name
	 * @param {string} outputDirectory
	 */
	constructor(
		Type,
		Name,
		outputDirectory
	) {
		this.Type = Type;
		this.Name = Name;
		this.Output = outputDirectory;
	}

}

class SpectrumAnalysisExportFirstLayerData extends SpectrumAnalysisExport {
	/**
	 *
	 * @param {string} Name
	 * @param {string} outputDirectory
	 * @param {string[]} spectrumExportPaths - See SpectrumExport.fsPath
	 */
	constructor(Name, outputDirectory, spectrumExportPaths) {
		super(spectrumAnalysisExportTypeEnum.FirstLayerData, Name, outputDirectory);

		this.Files = spectrumExportPaths;
	}
}

/**
 * Exports layer concentration data with following structure:
 * 1. col: Index
 * 2. col: Layer thickness
 * 3. col: Layer roughness (FHWM)
 * 4. col: Element concentration
 */
class SpectrumAnalysisExportAllLayerConcentration extends SpectrumAnalysisExport {
	/**
	 *
	 * @param {string} Name
	 * @param {string} outputDirectory
	 * @param {string} spectrumExportPath - See SpectrumExport.fsPath
	 * @param {string} elementName
	 * @param {number[]} [layerIndicesToIgnore]
	 * @param {boolean} ignoreLast
	 */
	constructor(
		Name,
		outputDirectory,
		spectrumExportPath,
		elementName,
		layerIndicesToIgnore = [],
		ignoreLast
	)
	{
		// For compat with SIMNRA exports
		if (elementName.length === 1)
			elementName = elementName + " ";

		super(spectrumAnalysisExportTypeEnum.AllLayerConcentration, Name, outputDirectory);

		this.Files = [spectrumExportPath];
		this.elementName = elementName;
		this.layerIndicesToIgnore = layerIndicesToIgnore;
		this.ignoreLast = ignoreLast || IGNORE_LAST_LAYER_PER_DEFAULT;
	}
}

class SIMNRAService {

}

export default SIMNRAService;
export {
	SpectrumAnalysisExport,
	SpectrumAnalysisExportFirstLayerData,
	SpectrumAnalysisExportAllLayerConcentration

}
const spectrumAnalysisExportTypeEnum = {
	FirstLayerData: "FirstLayerData",
	AllLayerConcentration: "AllLayerConcentration",
	ThicknessesUntilPrevalenceReached: "ThicknessesUntilPrevalenceReached"
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
	 * @param {boolean} [insertLayer=false] - If true, an empty entry will be prepended and thicknesses of subsequent entries will be summed up for each entry
	 * @param {number[]} [layerIndicesToIgnore]
	 * @param {boolean} ignoreLast
	 */
	constructor(
		Name,
		outputDirectory,
		spectrumExportPath,
		elementName,
		insertLayer = false,
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
		this.insertLayer = insertLayer;
	}
}

/**
 * Analyses SIMNRA data and integrated prevalence (concentration*thickness) until the treshold value (0 to 1) is reached,
 * i.e. finds the depth until the given
 */
class SpectrumAnalysisExportThicknessesUntilPrevalenceReached extends SpectrumAnalysisExport {
	/**
	 * @param {string} Name
	 * @param {string} outputDirectory
	 * @param {string[]} spectrumExportPaths
	 * @param {string[]} spectrumExportNames - Same size as spectrumExportPaths
	 * @param {string} elementName
	 * @param {number} thresholdFraction
	 */
	constructor(
		Name,
		outputDirectory,
		spectrumExportPaths,
		spectrumExportNames,
		elementName,
		thresholdFraction
	) {
		// For compat with SIMNRA exports
		if (elementName.length === 1)
			elementName = elementName + " ";

		super(spectrumAnalysisExportTypeEnum.ThicknessesUntilPrevalenceReached, Name, outputDirectory);

		this.Files = spectrumExportPaths;
		this.Names = spectrumExportNames;

		this.elementName = elementName;
		this.thresholdFraction = thresholdFraction;
	}
}

/**
 * Sums up all elemental prevalence until a fixed (absolute) thickness was reached and calculates the prevalence fraction relative to total prevalence
 */
class SpectrumAnalysisExportPrevalenceSumUntilThicknessReached extends SpectrumAnalysisExport {
	/**
	 * @param {string} Name
	 * @param {string} outputDirectory
	 * @param {string[]} spectrumExportPaths
	 * @param {string[]} spectrumExportNames - Same size as spectrumExportPaths
	 * @param {string} elementName
	 * @param {number} thresholdThickness - In 10^15 atoms/cm²
	 */
	constructor(
		Name,
		outputDirectory,
		spectrumExportPaths,
		spectrumExportNames,
		elementName,
		thresholdThickness
	) {
		// For compat with SIMNRA exports
		if (elementName.length === 1)
			elementName = elementName + " ";

		super(spectrumAnalysisExportTypeEnum.ThicknessesUntilPrevalenceReached, Name, outputDirectory);

		this.Files = spectrumExportPaths;
		this.Names = spectrumExportNames;

		this.elementName = elementName;
		this.thresholdThickness = thresholdThickness;
	}
}

class SIMNRAService {

}

export default SIMNRAService;
export {
	SpectrumAnalysisExport,
	SpectrumAnalysisExportFirstLayerData,
	SpectrumAnalysisExportAllLayerConcentration,
	SpectrumAnalysisExportThicknessesUntilPrevalenceReached,
	SpectrumAnalysisExportPrevalenceSumUntilThicknessReached
}
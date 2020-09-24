import {ObjectRepository} from "../../../xdms3/lib/Entities/UDBI/ObjectManager.mjs";
import {MySQLObjectManager} from "../../../xdms3/lib/Entities/UDBIAdapters/MySQL.mjs";
import SpectrumExport from "../SpectrumExport.mjs";
import SIMNRALayer from "../SIMNRALayer.mjs";

class SIMNRALayerRepository extends ObjectRepository {
	/**
	 *
	 * @param {MySQLObjectManager} objectManager
	 */
	constructor(objectManager) {
		super(objectManager);
	}

	/**
	 *
	 * @param {SpectrumExport} spectrumExport
	 * @param {number} layerIndex
	 * @returns {Promise<SIMNRALayer|null>}
	 */
	async findBySpectrumAndLayerIndex (
		spectrumExport,
		layerIndex
	) {
		return SIMNRALayer.query().findOne({
			spectrumId: spectrumExport.id
		});
	}

	async Init () {
		return true;
	}
}

export default SIMNRALayerRepository;
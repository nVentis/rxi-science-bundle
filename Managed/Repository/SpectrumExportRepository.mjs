import {ObjectRepository} from "../../../xdms3/lib/Entities/UDBI/ObjectManager.mjs";
import {MySQLObjectManager} from "../../../xdms3/lib/Entities/UDBIAdapters/MySQL.mjs";
import SpectrumExport from "../SpectrumExport.mjs";

class SpectrumExportRepository extends ObjectRepository {
	/**
	 *
	 * @param {MySQLObjectManager} objectManager
	 */
	constructor(objectManager) {
		super(objectManager);
	}

	async Init () {
		return true;
	}

	/**
	 *
	 * @param {string} fsPath
	 * @returns {SpectrumExport}
	 */
	async findByFsPath (fsPath) {
		return SpectrumExport.query().findOne({
			fsPath: fsPath
		});
	}

	/**
	 *
	 * @param {string} fsPath
	 * @param {Date} changedAt
	 * @returns {Promise<SpectrumExport>}
	 */
	async createEntity (
		fsPath,
		changedAt
	) {
		return SpectrumExport.query().insertAndFetch({
			fsPath,
			changedAt
		});
	}
}

export default SpectrumExportRepository;
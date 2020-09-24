import {ObjectRepository} from "../../../xdms3/lib/Entities/UDBI/ObjectManager.mjs";
import {MySQLObjectManager} from "../../../xdms3/lib/Entities/UDBIAdapters/MySQL.mjs";

class SIMNRALayerPartRepository extends ObjectRepository {
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
}

export default SIMNRALayerPartRepository;
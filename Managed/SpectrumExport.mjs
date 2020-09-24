import objection from "objection";
import {UDBITableSchema} from "../../xdms3/lib/Entities/UDBI/Core.mjs";
import FieldTypeInteger from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeInteger.mjs";
import FieldTypeString from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeString.mjs";
import FieldTypeTimestamp, {FieldTypeTimestampValueNow} from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeTimestamp.mjs";
import SpectrumExportRepository from "./Repository/SpectrumExportRepository.mjs";
import SIMNRALayer from "./SIMNRALayer.mjs";

/**
 * Base class of User and GroupLink
 * @class
 * @property {number} id
 * @property {string} fsPath
 * @property {Date} createdAt
 * @property {Date} changedAt
 * @property {SIMNRALayer[]} Layers
 */
class SpectrumExport extends objection.Model {
	static repoClass = SpectrumExportRepository;

	static idColumn = "id";
	static tableName = "spectrum_export";

	static relationMappings = {
		Layers: {
			relation: objection.Model.HasManyRelation,
			modelClass: SIMNRALayer,
			join: {
				from: "spectrum_export.id",
				to: "simnra_layer.spectrumId"
			}
		}
	}
}

let SpectrumExportSchema = new UDBITableSchema([
	new FieldTypeInteger("id", true, { Nullable: false, Unsigned: true }),
	new FieldTypeString("fsPath", 255, { Nullable: false }),
	new FieldTypeTimestamp("createdAt", { Precision: 6, Default: new FieldTypeTimestampValueNow(6) }),
	new FieldTypeTimestamp("changedAt", { Precision: 6, Default: new FieldTypeTimestampValueNow(6) })
]);

export default SpectrumExport;
export {
	SpectrumExportSchema
}
import objection from "objection";
import {UDBITableSchema} from "../../xdms3/lib/Entities/UDBI/Core.mjs";
import FieldTypeInteger from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeInteger.mjs";
import FieldTypeString from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeString.mjs";
import FieldTypeText from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeText.mjs";

import {FIELD_ON_DELETE, FIELD_ON_UPDATE} from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeGeneric.mjs";
import FieldTypeFloat from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeFloat.mjs";

const TABLE_NAME = "simnra_layer_roughness";

/**
 * DB item for representing layers as given in SIMNRA
 * @class
 * @property {number} partId
 * @property {number} spectrumId
 * @property {string} password
 * @property {Subject} Subject
 */
class SIMNRALayerRoughness extends objection.Model {
	static tableName = TABLE_NAME;
	static idColumn = "id";
}

/**
 * Database schema
 * @type {UDBITableSchema}
 */
let SIMNRALayerRoughnessSchema = new UDBITableSchema([
	new FieldTypeInteger("id", true, { Nullable: false, Unsigned: true  }),
	new FieldTypeInteger("layerId", false, {
		Nullable: true,
		Unsigned: true,
		isIndex: true,
		refColumn: "id",
		refTable: "simnra_layer",
		onDelete: FIELD_ON_DELETE.CASCADE,
		onUpdate: FIELD_ON_UPDATE.CASCADE,
	}),
	new FieldTypeString("type", 10, { Nullable: false }),

], null, { Name: TABLE_NAME });

export default SIMNRALayerRoughness;
export {
	SIMNRALayerRoughnessSchema
}
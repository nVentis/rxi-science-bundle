import objection from "objection";
import {UDBITableSchema} from "../../xdms3/lib/Entities/UDBI/Core.mjs";
import FieldTypeInteger from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeInteger.mjs";
import SIMNRALayerPart from "./SIMNRALayerPart.mjs";

import SIMNRALayerRepository from "./Repository/SIMNRALayerRepository.mjs";
import {FIELD_ON_DELETE, FIELD_ON_UPDATE} from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeGeneric.mjs";
import FieldTypeFloat from "../../xdms3/lib/Entities/UDBI/FieldTypes/FieldTypeFloat.mjs";

const TABLE_NAME = "simnra_layer";

/**
 * DB item for representing layers as given in SIMNRA
 * @class
 * @property {number} id
 * @property {number} spectrumId
 * @property {number} thickness
 * @property {number} index - Starting from 1
 * @property {number} roughnessGammaFWHM - Some float
 * @property {SIMNRALayerPart[]} Parts
 */
class SIMNRALayer extends objection.Model {
	static repoClass = SIMNRALayerRepository;

	static tableName = TABLE_NAME;
	static idColumn = "id";

	static relationMappings = {
		Parts: {
			relation: objection.Model.HasManyRelation,
			modelClass: SIMNRALayerPart,
			join: {
				from: `${SIMNRALayer.tableName}.${SIMNRALayer.idColumn}`,
				to: `simnra_layer_part.layerId`
			}
		}
	}
}

/**
 * Database schema
 * @type {UDBITableSchema}
 */
let SIMNRALayerSchema = new UDBITableSchema([
	new FieldTypeInteger("id", true, { Nullable: false, Unsigned: true  }),
	new FieldTypeInteger("spectrumId", false, {
		Nullable: true,
		Unsigned: true,
		isIndex: true,
		refColumn: "id",
		refTable: "spectrum_export",
		onDelete: FIELD_ON_DELETE.CASCADE,
		onUpdate: FIELD_ON_UPDATE.CASCADE,
	}),
	new FieldTypeFloat("thickness", 32, 16),
	new FieldTypeInteger("index", false, { Nullable: false, Unsigned: true }),
	new FieldTypeFloat("roughnessGammaFWHM", 32, 16)
], null, { Name: TABLE_NAME });

export default SIMNRALayer;
export {
	SIMNRALayerSchema
}
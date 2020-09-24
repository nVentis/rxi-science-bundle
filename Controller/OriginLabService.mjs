import ApplicationSI from "../../origin-com-js/trunk/lib/ApplicationSI.mjs";

class OriginLabService {
	/**
	 *
	 * @type {Application}
	 */
	appInstance = null;

	constructor(originLabServiceConfig) {

	}

	async Init () {
		let App = new ApplicationSI();
		this.appInstance = App;

		setTimeout(async function () {
			let worksheet = await App.FindWorksheetByLongname("r-01_FeW_Si-1_4MeV#1.dat");
			if (worksheet) {
				console.log("Worksheet found!");
				await worksheet.Execute('csetvalue col:=2 formula:="5,32845*A+16,16289";');
			}
		}, 500);

		return true;
	}
}

export default OriginLabService;
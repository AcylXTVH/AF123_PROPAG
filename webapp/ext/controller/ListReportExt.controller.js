sap.ui.define([
	'sap/ui/core/mvc/ControllerExtension',
	'sap/ui/model/json/JSONModel',
	'sap/ui/model/Filter',
	'sap/m/MessageToast',
	'sap/ui/mdc/p13n/StateUtil'
], function (ControllerExtension, JSONModel, Filter, MessageToast, StateUtil) {
	'use strict';

	return ControllerExtension.extend('com.socotec.aff.propagdemande.ext.controller.ListReportExt', {

		override: {
			onInit: function () {
				const oFilterBar = sap.ui.getCore().byId(
					this.base.getView().getId() + "--fe::FilterBar::ZR_AFF_PROPAG_DEMANDE"
				);

				if (oFilterBar) {
					oFilterBar.attachSearch(this.onFilterBarSearch, this);
				}
			}
		},

		onPropagerCustom: async function (oEvent) {

			const oExtensionAPI = this.base.getExtensionAPI();
			const aSelectedContexts = oExtensionAPI.getSelectedContexts();

			if (!aSelectedContexts || aSelectedContexts.length === 0) {
				return;
			}

			// --- Récupération du Champ métier sélectionné dans la barre de filtres ---
			let sChampMetierFiltre = "";
			const oFilterBar = sap.ui.getCore().byId(
				this.base.getView().getId() + "--fe::FilterBar::ZR_AFF_PROPAG_DEMANDE"
			);
			if (oFilterBar) {
				const oConditions = oFilterBar.getConditions();
				const aConditionsChampMetier = oConditions.ChampMetier;
				if (aConditionsChampMetier && aConditionsChampMetier.length > 0) {
					sChampMetierFiltre = aConditionsChampMetier[0].values[0];
				}
			}

			const aTypesDocument = [];
			let bDocumentCoche = false;
			let bPosteCoche = false;
			let bProjetCoche = false;

			for (const oCtx of aSelectedContexts) {
				const oObj = oCtx.getObject();

				if (!aTypesDocument.includes(oObj.TypeProcessus)) {
					aTypesDocument.push(oObj.TypeProcessus);
				}

				if (oObj.Niveau === "=Projet=") {
					bProjetCoche = true;
				} else if (oObj.NumPoste === "0") {
					bDocumentCoche = true;
				} else {
					bPosteCoche = true;
				}
			}

			const oModel = this.base.getView().getModel();
			const aFilters = aTypesDocument.map(t => new Filter("TypeDocument", "EQ", t));

			const oListBinding = oModel.bindList("/ConfigPropagation", undefined, undefined, [
				new Filter({ filters: aFilters, and: false }),
				new Filter("Actif", "EQ", "X")
			]);

			const aContexts = await oListBinding.requestContexts();

			const oSeen = {};
			const aConfig = [];
			aContexts.forEach(ctx => {
				const o = ctx.getObject();

				// --- Filtre sur le Champ métier sélectionné, s'il y en a un ---
				if (sChampMetierFiltre && o.ChampLibelle !== sChampMetierFiltre) {
					return;
				}

				const sMaille = (o.Maille || "").trim();

				let bValide = false;
				switch (sMaille) {
					case "ENTETE":
						bValide = bDocumentCoche;
						break;
					case "ENT_PARENT":
					case "TOUS_NIV":
						bValide = bDocumentCoche || bPosteCoche;
						break;
					case "PARENT":
					case "PAR_FILSSF":
						bValide = bPosteCoche;
						break;
					case "PROJET":
						bValide = bProjetCoche;
						break;
				}

				if (bValide && !oSeen[o.ChampTechnique]) {
					oSeen[o.ChampTechnique] = true;
					aConfig.push(Object.assign({}, o, { selected: !!sChampMetierFiltre, valeur: "" }));
				}
			});

			const oJSONModel = new JSONModel({ champs: aConfig });

			if (!this._oDialog) {
				this._oDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.PropagerDialog",
					controller: this
				});
				this.base.getView().addDependent(this._oDialog);
			}
			this._oDialog.setModel(oJSONModel, "config");
			this._oDialog.open();
		},

		onFermerDialog: function () {
			this._oDialog.close();
		},

		onExecuterPropagation: async function () {
			const oJSONModel = this._oDialog.getModel("config");
			const aChampsCoches = oJSONModel.getProperty("/champs").filter(c => c.selected);

			if (aChampsCoches.length === 0) {
				MessageToast.show("Sélectionnez au moins un champ à propager.");
				return;
			}

			const aParamChamps = aChampsCoches.map(c => ({
				CHAMP_TECHNIQUE: c.ChampTechnique,
				VALEUR: c.valeur
			}));

			const oExtensionAPI = this.base.getExtensionAPI();
			const aSelectedContexts = oExtensionAPI.getSelectedContexts();

			const oPremiereLigne = aSelectedContexts[0].getObject();
			const sProjetPspid = (oPremiereLigne.Niveau === "=Projet=") ? oPremiereLigne.ElementOTP : "";

			this._oDialog.close();

			try {
				await oExtensionAPI.getEditFlow().invokeAction(
					"com.sap.gateway.srvd.zui_aff_propag_demande.v0001.propager",
					{
						contexts: aSelectedContexts,
						model: this.base.getView().getModel(),
						label: "Propager",
						parameterValues: [
							{ name: "CHAMPS", value: aParamChamps },
							{ name: "PROJET_PSPID", value: sProjetPspid }
						],
						skipParameterDialog: true
					}
				);

				MessageToast.show("Propagation exécutée avec succès.");

			} catch (oError) {
				console.error(oError);
				MessageToast.show("Erreur lors de la propagation — voir la console.");
			}
		},

		onValueHelpRequest: async function (oEvent) {
			this._oInputSource = oEvent.getSource();
			const oBindingContext = this._oInputSource.getBindingContext("config");
			const sTypeControle = oBindingContext.getProperty("TypeControle");

			if (sTypeControle === "MC_BP") {
				await this._openBpValueHelp();
			} else if (sTypeControle === "MC_ADRESSE") {
				await this._openBpAdresseValueHelp();
			} else if (sTypeControle === "DROPDOWN") {
				await this._openDomaineValueHelp(oBindingContext);
			} else if (sTypeControle === "MC_MODEPAI") {
				await this._openModePaiementValueHelp();
			} else if (sTypeControle === "MC_TUNIT") {
				await this._openTimeUnitValueHelp();
			} else if (sTypeControle === "MC_BLOCFA") {
				await this._openBlocFactValueHelp();
			} else if (sTypeControle === "MC_TYPPLAN") {
				await this._openTypePlanifValueHelp();
			} else if (sTypeControle === "MC_FUNCLOC") {
				await this._openFuncLocValueHelp();
			} else if (sTypeControle === "MC_ECHEANC") {
				await this._openEcheancierValueHelp();
			}
		},

		_openTypePlanifValueHelp: async function () {
			if (!this._oTypePlanifDialog) {
				this._oTypePlanifDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.TypePlanifValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oTypePlanifDialog);
			}
			this._oTypePlanifDialog.open();
		},

		onTypePlanifSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sCle = oSelectedItem.getBindingContext().getProperty("Cle");
				this._oInputSource.setValue(sCle);
			}
		},

		_openBlocFactValueHelp: async function () {
			if (!this._oBlocFactDialog) {
				this._oBlocFactDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.BlocFactValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oBlocFactDialog);
			}
			this._oBlocFactDialog.open();
		},

		onBlocFactSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sCle = oSelectedItem.getBindingContext().getProperty("Cle");
				this._oInputSource.setValue(sCle);
			}
		},

		_openTimeUnitValueHelp: async function () {
			if (!this._oTimeUnitDialog) {
				this._oTimeUnitDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.TimeUnitValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oTimeUnitDialog);
			}
			this._oTimeUnitDialog.open();
		},

		onTimeUnitSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sCle = oSelectedItem.getBindingContext().getProperty("Cle");
				this._oInputSource.setValue(sCle);
			}
		},

		_openDomaineValueHelp: async function (oConfigContext) {
			const sDataElement = oConfigContext.getProperty("DataElement");

			if (!this._oDomaineDialog) {
				this._oDomaineDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.DomaineValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oDomaineDialog);
			}

			const oBinding = this._oDomaineDialog.getBinding("items");
			oBinding.filter(new Filter("DataElement", "EQ", sDataElement));
			this._oDomaineDialog.open();
		},

		onDomaineSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sCle = oSelectedItem.getBindingContext().getProperty("Cle");
				this._oInputSource.setValue(sCle);
			}
		},

		_openModePaiementValueHelp: async function () {
			if (!this._oModePaiementDialog) {
				this._oModePaiementDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.ModePaiementValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oModePaiementDialog);
			}
			this._oModePaiementDialog.open();
		},

		onModePaiementSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sCle = oSelectedItem.getBindingContext().getProperty("Cle");
				this._oInputSource.setValue(sCle);
			}
		},

		_openBpValueHelp: async function () {
			if (!this._oBpDialog) {
				this._oBpDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.BpValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oBpDialog);
			}
			this._oBpDialog.open();
		},

		_openBpAdresseValueHelp: async function () {

			const oBindingContext = this._oInputSource.getBindingContext("config");
			const sChampTechnique = oBindingContext.getProperty("ChampTechnique");

			const mChampVersColonnePartner = {
				"ADDR_CLIENT_FACTURE": "Partner_Client_Facture",
				"ADDR_PAYEUR": "Partner_Payeur",
				"ADDR_FOURNISSEUR": "Partner_Fournisseur",
				"ADDR_RECEPTIONNAIRE": "Partner_Receptionnaire",
				"ADDR_DEST_FACTURE": "Partner_Dest_Facture"
			};

			const sNomColonnePartner = mChampVersColonnePartner[sChampTechnique];

			const oExtensionAPI = this.base.getExtensionAPI();
			const aSelectedContexts = oExtensionAPI.getSelectedContexts();

			let sPartnerIdFiltre = "";

			if (aSelectedContexts.length > 0 && sNomColonnePartner) {
				const sGuidObjet = aSelectedContexts[0].getObject().GuidObjet;

				const oModel = this.base.getView().getModel();
				const oListBinding = oModel.bindList("/ZR_AFF_PROPAG_DEMANDE", undefined, undefined, [
					new Filter("GuidObjet", "EQ", sGuidObjet)
				]);
				const aContexts = await oListBinding.requestContexts(0, 1);

				if (aContexts.length > 0) {
					sPartnerIdFiltre = aContexts[0].getObject()[sNomColonnePartner] || "";
				}
			}

			//console.log("_openBpAdresseValueHelp - sChampTechnique:", sChampTechnique, "sNomColonnePartner:", sNomColonnePartner, "sPartnerIdFiltre:", sPartnerIdFiltre);

			if (!this._oBpAdresseDialog) {
				this._oBpAdresseDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.BpAdresseValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oBpAdresseDialog);
			}

			const oBinding = this._oBpAdresseDialog.getBinding("items");
			if (sPartnerIdFiltre) {
				oBinding.filter([new Filter("PartnerId", "EQ", sPartnerIdFiltre)]);
			} else {
				oBinding.filter([]);
			}

			this._oBpAdresseDialog.open();
		},

		onBpAdresseSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const oData = oSelectedItem.getBindingContext().getObject();
				this._oInputSource.setValue(oData.AddrNr);
			}
		},

		onBpAdresseSearch: function (oEvent) {
			const sValue = oEvent.getParameter("value");
			const oBinding = oEvent.getSource().getBinding("items");
			oBinding.filter(sValue ? new Filter("NomEntreprise", "Contains", sValue) : []);
		},

		onBpSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sPartnerId = oSelectedItem.getBindingContext().getProperty("PartnerId");
				this._oInputSource.setValue(sPartnerId);
			}
		},

		onBpSearch: function (oEvent) {
			const sValue = oEvent.getParameter("value");
			const oBinding = oEvent.getSource().getBinding("items");
			oBinding.filter(sValue ? new Filter("PartnerId", "Contains", sValue) : []);
		},

		_openFuncLocValueHelp: async function () {
			if (!this._oFuncLocDialog) {
				this._oFuncLocDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.FuncLocValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oFuncLocDialog);
			}
			this._oFuncLocDialog.open();
		},

		onFuncLocSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sTplnr = oSelectedItem.getBindingContext().getProperty("Tplnr");
				this._oInputSource.setValue(sTplnr);
			}
		},

		_openEcheancierValueHelp: async function () {
			if (!this._oEcheancierDialog) {
				this._oEcheancierDialog = await this.base.getExtensionAPI().loadFragment({
					name: "com.socotec.aff.propagdemande.ext.fragment.EcheancierValueHelp",
					controller: this
				});
				this.base.getView().addDependent(this._oEcheancierDialog);
			}
			this._oEcheancierDialog.open();
		},

		onEcheancierSelected: function (oEvent) {
			const oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				const sCle = oSelectedItem.getBindingContext().getProperty("Cle");
				this._oInputSource.setValue(sCle);
			}
		},

		onFilterBarSearch: function (oEvent) {
			const oFilterBar = oEvent.getSource();
			const oConditions = oFilterBar.getConditions();

			const aConditionsChampMetier = oConditions.ChampMetier;
			let sChampMetierFiltre = "";
			if (aConditionsChampMetier && aConditionsChampMetier.length > 0) {
				sChampMetierFiltre = aConditionsChampMetier[0].values[0];
			}

			this._afficherColonneChampMetier(sChampMetierFiltre);
		},

		_afficherColonneChampMetier: async function (sChampMetier) {

			const mChampTechniqueVersColonne = {
				"ZZ1_AIFE_IDENTIFIANT_SRH": "ZZ1_Aife_Identifiant_Srh",
				"ZZ1_AIFE_CODE_ENG_SRH": "ZZ1_Aife_Code_Eng_Srh",
				"ZZ1_AIFE_SERV_EXE_SRH": "ZZ1_Aife_Serv_Exe_Srh",
				"CONTEND": "Contend",
				"PMNTTRMS": "Pmnttrms",
				"MODALITES_PAIEMENT": "Payment_Method",
				"ZZ1_ECHEANCIER_SRH": "ZZ1_Echeancier_Srh",
				"ZZ1_REVISIONF_SRH": "ZZ1_Revisionf_Srh",
				"ZZ1_REFCLIENT_SRH": "ZZ1_Refclient_Srh",
				"QUOT_START": "Quot_Start",
				"QUOT_END": "Quot_End",
				"AUTO_RENEW_INDICATOR": "Auto_Renew_Indicator",
				"AUTO_RENEW_PERIOD": "Auto_Renew_Period",
				"AUTO_RENEW_PERIOD_UNIT": "Auto_Renew_Period_Unit",
				"AUTO_RENEW_EXTEN": "Auto_Renew_Exten",
				"AUTO_RENEW_EXTEN_UNIT": "Auto_Renew_Exten_Unit",
				"BILLING_BLOCK": "Billing_Block",
				"ZZ1_TYPEPLANIF_SRI": "ZZ1_Typeplanif_Sri",
				"ZZ1_TYPEPLANIF_H_SRH": "ZZ1_Typeplanif_Sri",
				"ZZ1_COCHEAVISVISITE1_SRI": "ZZ1_Cocheavisvisite1_Sri",
				"ZZ1_COCHEAVIS1_H_SRH": "ZZ1_Cocheavisvisite1_Sri",
				"ZZ1_COCHEAVISVISITE2_SRI": "ZZ1_Cocheavisvisite2_Sri",
				"ZZ1_COCHEAVIS2_H_SRH": "ZZ1_Cocheavisvisite2_Sri",
				"ADDR_CLIENT_FACTURE": "Client_Facture",
				"ADDR_PAYEUR": "Payeur",
				"ADDR_FOURNISSEUR": "Fournisseur",
				"ADDR_RECEPTIONNAIRE": "Receptionnaire",
				"ADDR_DEST_FACTURE": "Destinataire_Facture",
				"CONTACT_DONNEUR_ORDRE": "Contact_Donneur_Ordre",
				"CONTACT_AVIS_VISITE_SUPP": "Contact_Avis_Visite_Suppl",
				"CONTACT_SUR_SITE": "Contact_Sur_Site",
				"CONTACT_DESTINATAIRE_FACT": "Contact_Destinataire_Fact",
				"CONTACT_DESTINATAIRE_FACT2": "Contact_Destinataire_Fact2",
				"CONTACT_DESTINATAIRE_FACT3": "Contact_Destinataire_Fact3",
				"CONTACT_DESTINATAIRE_FACT4": "Contact_Destinataire_Fact4",
				"CONTACT_ENVOI_RAPPORT": "Contact_Envoi_Rapport",
				"CONTACT_ENVOI_RAPPORT_SUPP": "Contact_Envoi_Rapport_Suppl",
				"FUNCTIONAL_LOCATION_ID": "Functional_Location_Id",
				"TEXT_CONTENT": "Text_Content",
				"PROJET_DESIGNATION_LONGUE": "Projet_Designation_Longue",
				"PROJET_DONNEUR_ORDRE": "Projet_Donneur_Ordre",
				"AUTO_RENEW_EXTEND": "Auto_Renew_Exten",
				"AUTO_RENEW_PERIOD": "Auto_Renew_Period",
			};

			const oModel = this.base.getView().getModel();
			let sChampTechnique = "";

			if (sChampMetier) {
				const oListBinding = oModel.bindList("/ConfigPropagation", undefined, undefined, [
					new Filter("ChampLibelle", "EQ", sChampMetier)
				]);
				const aContexts = await oListBinding.requestContexts(0, 1);
				if (aContexts.length > 0) {
					sChampTechnique = aContexts[0].getObject().ChampTechnique;
				}
			}

			// --- DIAGNOSTIC TEMPORAIRE ---
			console.log("_afficherColonneChampMetier - sChampMetier:", sChampMetier, "→ sChampTechnique:", sChampTechnique);

			const sNomColonneActive = mChampTechniqueVersColonne[sChampTechnique];

			console.log("_afficherColonneChampMetier - sNomColonneActive:", sNomColonneActive);
			// --- FIN DIAGNOSTIC ---

			const oTable = sap.ui.getCore().byId(
				this.base.getView().getId() + "--fe::table::ZR_AFF_PROPAG_DEMANDE::LineItem"
			);
			if (!oTable) {
				return;
			}

			const aItems = Object.values(mChampTechniqueVersColonne).map(function (sNomColonne) {
				return {
					name: sNomColonne,
					visible: (sNomColonne === sNomColonneActive)
				};
			});

			try {
				await StateUtil.applyExternalState(oTable, { items: aItems });
			} catch (oError) {
				console.error("_afficherColonneChampMetier - erreur StateUtil:", oError);
			}
		}

	});
});
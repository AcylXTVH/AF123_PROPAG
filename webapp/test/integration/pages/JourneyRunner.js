sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/socotec/aff/propagdemande/test/integration/pages/ZR_AFF_PROPAG_DEMANDEList.gen",
	"com/socotec/aff/propagdemande/test/integration/pages/ZR_AFF_PROPAG_DEMANDEObjectPage.gen"
], function (JourneyRunner, ZR_AFF_PROPAG_DEMANDEListGenerated, ZR_AFF_PROPAG_DEMANDEObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/socotec/aff/propagdemande') + '/test/flp.html#app-preview',
        pages: {
			onTheZR_AFF_PROPAG_DEMANDEListGenerated: ZR_AFF_PROPAG_DEMANDEListGenerated,
			onTheZR_AFF_PROPAG_DEMANDEObjectPageGenerated: ZR_AFF_PROPAG_DEMANDEObjectPageGenerated
        },
        async: true
    });

    return runner;
});


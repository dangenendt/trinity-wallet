import get from 'lodash/get';
import { Navigation } from 'react-native-navigation';
import { withNamespaces } from 'react-i18next';
import { Text, TextInput, NetInfo } from 'react-native';
import { Provider } from 'react-redux';
import { changeIotaNode, SwitchingConfig } from 'shared-modules/libs/iota';
import iotaNativeBindings, { overrideAsyncTransactionObject } from 'shared-modules/libs/iota/nativeBindings';
import { fetchNodeList as fetchNodes } from 'shared-modules/actions/polling';
import { setCompletedForcedPasswordUpdate } from 'shared-modules/actions/settings';
import { ActionTypes } from 'shared-modules/actions/wallet';
import i18next from 'shared-modules/libs/i18next';
import axios from 'axios';
import { getLocaleFromLabel } from 'shared-modules/libs/i18n';
import { clearKeychain } from 'libs/keychain';
import { getDigestFn } from 'libs/nativeModules';
import registerScreens from 'ui/routes/navigation';
import { mapStorageToState } from '../../../../shared/libs/storageToStateMappers';

const launch = (store) => {
    // Disable auto node switching.
    SwitchingConfig.autoSwitch = false;

    // Disable accessibility fonts
    Text.defaultProps.allowFontScaling = false;
    TextInput.defaultProps.allowFontScaling = false;

    // Ignore android warning against timers
    console.ignoredYellowBox = ['Setting a timer']; // eslint-disable-line no-console

    const state = store.getState();

    // Clear keychain if onboarding is not complete
    if (!state.accounts.onboardingComplete) {
        clearKeychain();
        store.dispatch(setCompletedForcedPasswordUpdate());
    }

    // Set default language
    i18next.changeLanguage(getLocaleFromLabel(state.settings.language));

    // FIXME: Temporarily needed for password migration
    const updatedState = store.getState();
    const navigateToForceChangePassword =
        updatedState.settings.versions.version === '0.5.0' && !updatedState.settings.completedForcedPasswordUpdate;

    // Select initial screen
    const initialScreen = state.accounts.onboardingComplete
        ? navigateToForceChangePassword ? 'forceChangePassword' : 'login'
        : 'languageSetup';
    renderInitialScreen(initialScreen);
};

const renderInitialScreen = (initialScreen) => {
    Navigation.startSingleScreenApp({
        screen: {
            screen: initialScreen,
            navigatorStyle: {
                navBarHidden: true,
                navBarTransparent: true,
                topBarElevationShadowEnabled: false,
                drawUnderStatusBar: true,
                statusBarColor: '#181818',
                screenBackgroundColor: '#181818',
            },
        },
        appStyle: {
            orientation: 'portrait',
            keepStyleAcrossPush: true,
        },
    });
};

/**
 *  Fetch IRI nodes list from server
 *
 *   @method fetchNodeList
 *   @param {object} store - redux store object
 **/
const fetchNodeList = (store) => {
    const { settings } = store.getState();
    const hasAlreadyRandomized = get(settings, 'hasRandomizedNode');

    // Update provider
    changeIotaNode(get(settings, 'node'));

    store.dispatch(fetchNodes(!hasAlreadyRandomized));
};

/**
 *  Listens to connection changes and updates store on connection change
 *
 *   @method startListeningToConnectivityChanges
 *   @param {object} store - redux store object
 **/
const startListeningToConnectivityChanges = (store) => {
    const checkConnection = (isConnected) => {
        store.dispatch({
            type: ActionTypes.CONNECTION_CHANGED,
            payload: { isConnected },
        });
    };

    NetInfo.isConnected.addEventListener('connectionChange', checkConnection);
};

/**
 *  Determines if device has connection.
 *
 *   @method startListeningToConnectivityChanges
 *   @param {string} url
 *   @param {object} options
 *
 *   @returns {Promise}
 **/
const hasConnection = (
    url,
    options = { fallbackUrl1: 'https://www.google.com', fallbackUrl2: 'https://www.sogou.com' },
) => {
    return NetInfo.getConnectionInfo().then(() =>
        axios
            .get(url, { timeout: 3000 })
            .then((response) => {
                return response.status === 200;
            })
            .catch(() => {
                if (url !== options.fallbackUrl1 && url !== options.fallbackUrl2) {
                    return hasConnection(options.fallbackUrl1);
                }
                if (url === options.fallbackUrl1) {
                    return hasConnection(options.fallbackUrl2);
                }

                return false;
            }),
    );
};

// Initialization function
// Passed as a callback to persistStore to adjust the rendering time
const initialize = (store) => {
    overrideAsyncTransactionObject(iotaNativeBindings, getDigestFn());


    store.dispatch({
        type: ActionTypes.MAP_STORAGE_TO_STATE,
        payload: mapStorageToState()
    });

    const initialize = (isConnected) => {
        store.dispatch({
            type: ActionTypes.CONNECTION_CHANGED,
            payload: { isConnected },
        });
        fetchNodeList(store);
        startListeningToConnectivityChanges(store);

        registerScreens(store, Provider);
        withNamespaces.setI18n(i18next);

        launch(store);
    };

    hasConnection('https://iota.org').then((isConnected) => initialize(isConnected));
};

initialize(store);

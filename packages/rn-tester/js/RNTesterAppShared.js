/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

import {RNTesterEmptyBookmarksState} from './components/RNTesterEmptyBookmarksState';
import RNTesterModuleContainer from './components/RNTesterModuleContainer';
import RNTesterModuleList from './components/RNTesterModuleList';
import RNTesterNavBar, {navBarHeight} from './components/RNTesterNavbar';
import {RNTesterThemeContext, themes} from './components/RNTesterTheme';
import RNTTitleBar from './components/RNTTitleBar';
import RNTesterList from './utils/RNTesterList';
import {
  RNTesterNavigationActionsType,
  RNTesterNavigationReducer,
} from './utils/RNTesterNavigationReducer';
import {
  Screens,
  getExamplesListWithBookmarksAndRecentlyUsed,
  initialNavigationState,
} from './utils/testerStateUtils';
import * as React from 'react';
import {BackHandler, Platform, StyleSheet, useColorScheme, TVEventControl, View} from 'react-native';

// RNTester App currently uses in memory storage for storing navigation state

const RNTesterApp = (): React.Node => {
  const [state, dispatch] = React.useReducer(
    RNTesterNavigationReducer,
    initialNavigationState,
  );
  const colorScheme = useColorScheme();

  const {
    activeModuleKey,
    activeModuleTitle,
    activeModuleExampleKey,
    screen,
    bookmarks,
    recentlyUsed,
  } = state;

  const examplesList = React.useMemo(
    () =>
      getExamplesListWithBookmarksAndRecentlyUsed({bookmarks, recentlyUsed}),
    [bookmarks, recentlyUsed],
  );

  const handleBackPress = React.useCallback(() => {
    if (activeModuleKey != null) {
      dispatch({type: RNTesterNavigationActionsType.BACK_BUTTON_PRESS});
    }
  }, [dispatch, activeModuleKey]);

  // Setup hardware back button press listener
  React.useEffect(() => {
    // For RNTester, menu key back navigation needs this enabled
    TVEventControl.enableGestureHandlersCancelTouches();
    if (activeModuleKey) {
      TVEventControl.enableTVMenuKey();
    } else {
      TVEventControl.disableTVMenuKey();
    }
    const handleHardwareBackPress = () => {
      if (activeModuleKey) {
        handleBackPress();
        return true;
      }
      return false;
    };

    BackHandler.addEventListener('hardwareBackPress', handleHardwareBackPress);

    return () => {
      BackHandler.removeEventListener(
        'hardwareBackPress',
        handleHardwareBackPress,
      );
    };
  }, [activeModuleKey, handleBackPress]);

  const handleModuleCardPress = React.useCallback(
    ({exampleType, key, title}: any) => {
      dispatch({
        type: RNTesterNavigationActionsType.MODULE_CARD_PRESS,
        data: {exampleType, key, title},
      });
    },
    [dispatch],
  );

  const handleModuleExampleCardPress = React.useCallback(
    (exampleName: string) => {
      dispatch({
        type: RNTesterNavigationActionsType.EXAMPLE_CARD_PRESS,
        data: {key: exampleName},
      });
    },
    [dispatch],
  );

  const toggleBookmark = React.useCallback(
    ({exampleType, key}: any) => {
      dispatch({
        type: RNTesterNavigationActionsType.BOOKMARK_PRESS,
        data: {exampleType, key},
      });
    },
    [dispatch],
  );

  const handleNavBarPress = React.useCallback(
    (args: {screen: string}) => {
      dispatch({
        type: RNTesterNavigationActionsType.NAVBAR_PRESS,
        data: {screen: args.screen},
      });
    },
    [dispatch],
  );

  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  if (examplesList === null) {
    return null;
  }

  const activeModule =
    activeModuleKey != null ? RNTesterList.Modules[activeModuleKey] : null;
  const activeModuleExample =
    activeModuleExampleKey != null
      ? activeModule?.examples.find(e => e.name === activeModuleExampleKey)
      : null;
  const title =
    activeModuleTitle != null
      ? activeModuleTitle
      : screen === Screens.COMPONENTS
      ? 'Components'
      : screen === Screens.APIS
      ? 'APIs'
      : 'Bookmarks';

  const activeExampleList =
    screen === Screens.COMPONENTS
      ? examplesList.components
      : screen === Screens.APIS
      ? examplesList.apis
      : examplesList.bookmarks;

  return (
    <RNTesterThemeContext.Provider value={theme}>
      <RNTTitleBar
        title={title}
        theme={theme}
        onBack={activeModule ? handleBackPress : null}
        documentationURL={activeModule?.documentationURL}
      />
      <View
        style={StyleSheet.compose(styles.container, {
          backgroundColor: theme.GroupedBackgroundColor,
        })}>
        {activeModule != null ? (
          <RNTesterModuleContainer
            module={activeModule}
            example={activeModuleExample}
            onExampleCardPress={handleModuleExampleCardPress}
          />
        ) : screen === Screens.BOOKMARKS &&
          examplesList.bookmarks.length === 0 ? (
          <RNTesterEmptyBookmarksState />
        ) : (
          <RNTesterModuleList
            sections={activeExampleList}
            toggleBookmark={toggleBookmark}
            handleModuleCardPress={handleModuleCardPress}
          />
        )}
      </View>
      <View style={Platform.isTV ? styles.tvNavBar : styles.bottomNavbar}>
        <RNTesterNavBar
          screen={screen || Screens.COMPONENTS}
          isExamplePageOpen={!!activeModule}
          handleNavBarPress={handleNavBarPress}
        />
      </View>
    </RNTesterThemeContext.Provider>
  );
};

export default RNTesterApp;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tvNavBar: {
    top: 20,
    left: '5%',
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    position: 'absolute',
    height: navBarHeight,
  },
  bottomNavbar: {
    bottom: 0,
    left: 20,
    width: '30%',
    display: 'flex',
    flexDirection: 'column',
    position: 'absolute',
    height: navBarHeight,
  },
  hidden: {
    display: 'none',
  },
});

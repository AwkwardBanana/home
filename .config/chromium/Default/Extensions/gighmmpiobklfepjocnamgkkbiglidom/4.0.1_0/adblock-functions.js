'use strict';

/* For ESLint: List any global identifiers used in this file below */
/* global chrome, log, License, runBandaids, openTab */

// Set to true to get noisier console.log statements
const VERBOSE_DEBUG = false;
let loggingEnable = false;

// Enabled in adblock_start_common.js and background.js if the user wants
const logging = function (enabled) {
  if (enabled) {
    loggingEnable = true;
    window.log = function log(...args) {
      if (VERBOSE_DEBUG || args[0] !== '[DEBUG]') { // comment out for verbosity
        // eslint-disable-next-line no-console
        console.log(...args);
      }
    };
  } else {
    window.log = function log() {
    };

    loggingEnable = false;
  }
};

logging(false); // disabled by default

// Behaves very similarly to $.ready() but does not require jQuery.
const onReady = function (callback) {
  if (document.readyState === 'complete') {
    window.setTimeout(callback, 0);
  } else {
    window.addEventListener('load', callback, false);
  }
};

// Excecute any bandaid for the specific site, if the bandaids.js was loaded.
onReady(() => {
  if (typeof runBandaids === 'function') {
    runBandaids();
  }
});

// Inputs:
//   - messageName : Str
//   - substitutions : Array of Str or a String
const translate = function (messageName, substitutions) {
  if (!messageName || typeof messageName !== 'string') {
    console.trace('missing messageName');
    return '';
  }

  let parts = substitutions;
  if (Array.isArray(parts)) {
    for (let i = 0; i < parts.length; i++) {
      if (typeof parts[i] !== 'string') {
        parts[i] = parts[i].toString();
      }
    }
  } else if (parts && typeof parts !== 'string') {
    parts = parts.toString();
  }

  // if VERBOSE_DEBUG is set to true, duplicate (double the length) of the translated strings
  // used for testing purposes only
  if (VERBOSE_DEBUG) {
    return `${chrome.i18n.getMessage(messageName, parts)}
            ${chrome.i18n.getMessage(messageName, parts)}`;
  }
  return chrome.i18n.getMessage(messageName, parts);
};

const splitMessageWithReplacementText = function (rawMessageText, messageID) {
  const anchorStartPos = rawMessageText.indexOf('[[');
  const anchorEndPos = rawMessageText.indexOf(']]');

  if (anchorStartPos === -1 || anchorEndPos === -1) {
    log('replacement tag not found', messageID, rawMessageText, anchorStartPos, anchorEndPos);
    return { error: 'no brackets found' };
  }
  const returnObj = {};
  returnObj.anchorPrefixText = rawMessageText.substring(0, anchorStartPos);
  returnObj.anchorText = rawMessageText.substring(anchorStartPos + 2, anchorEndPos);
  returnObj.anchorPostfixText = rawMessageText.substring(anchorEndPos + 2);
  return returnObj;
};

const processReplacementChildren = function ($el, replacementText, messageId) {
  // Replace a dummy <a/> inside of localized text with a real element.
  // Give the real element the same text as the dummy link.
  const $element = $el;
  const messageID = $element.attr('i18n') || messageId;
  if (!messageID || typeof messageID !== 'string') {
    $(this).addClass('i18n-replaced');
    return;
  }
  if (!$element.get(0).firstChild) {
    log('returning, no first child found', $element.attr('i18n'));
    return;
  }
  if (!$element.get(0).lastChild) {
    log('returning, no last child found', $element.attr('i18n'));
    return;
  }
  const replaceElId = `#${$element.attr('i18n_replacement_el')}`;
  if ($(replaceElId).length === 0) {
    log('returning, no child element found', $element.attr('i18n'), replaceElId);
    return;
  }
  const rawMessageText = chrome.i18n.getMessage(messageID) || '';
  const messageSplit = splitMessageWithReplacementText(rawMessageText, messageID);
  $element.get(0).firstChild.nodeValue = messageSplit.anchorPrefixText;
  $element.get(0).lastChild.nodeValue = messageSplit.anchorPostfixText;
  if ($(replaceElId).get(0).tagName === 'INPUT') {
    $(`#${$element.attr('i18n_replacement_el')}`).prop('value', replacementText || messageSplit.anchorText);
  } else {
    $(`#${$element.attr('i18n_replacement_el')}`).text(replacementText || messageSplit.anchorText);
  }

  // If localizePage is run again, don't let the [i18n] code above
  // clobber our work
  $element.addClass('i18n-replaced');
};

// Determine what language the user's browser is set to use
const determineUserLanguage = function () {
  if (typeof navigator.language !== 'undefined' && navigator.language) {
    return navigator.language.match(/^[a-z]+/i)[0];
  }
  return null;
};

const getUILanguage = function () {
  return chrome.i18n.getUILanguage();
};

// Set dir and lang attributes to the given el or to document.documentElement by default
const setLangAndDirAttributes = function (el) {
  const element = el instanceof HTMLElement ? el : document.documentElement;
  chrome.runtime.sendMessage({
    type: 'app.get',
    what: 'localeInfo',
  }).then((localeInfo) => {
    element.lang = localeInfo.locale;
    element.dir = localeInfo.bidiDir;
  });
};

const localizePage = function () {
  setLangAndDirAttributes();

  // translate a page into the users language
  $('[i18n]:not(.i18n-replaced, [i18n_replacement_el])').each(function i18n() {
    $(this).text(translate($(this).attr('i18n')));
  });

  $('[i18n_value]:not(.i18n-replaced)').each(function i18nValue() {
    $(this).val(translate($(this).attr('i18n_value')));
  });

  $('[i18n_title]:not(.i18n-replaced)').each(function i18nTitle() {
    $(this).attr('title', translate($(this).attr('i18n_title')));
  });

  $('[i18n_placeholder]:not(.i18n-replaced)').each(function i18nPlaceholder() {
    $(this).attr('placeholder', translate($(this).attr('i18n_placeholder')));
  });

  $('[i18n_replacement_el]:not(.i18n-replaced)').each(function i18nReplacementEl() {
    processReplacementChildren($(this));
  });

  $('[i18n-alt]').each(function i18nImgAlt() {
    $(this).attr('alt', translate($(this).attr('i18n-alt')));
  });

  $('[i18n-aria-label]').each(function i18nAriaLabel() {
    $(this).attr('aria-label', translate($(this).attr('i18n-aria-label')));
  });

  // Make a right-to-left translation for Arabic and Hebrew languages
  const language = determineUserLanguage();
  if (language === 'ar' || language === 'he') {
    $('#main_nav').removeClass('right').addClass('left');
    $('.adblock-logo').removeClass('left').addClass('right');
    $('.closelegend').css('float', 'left');
    document.documentElement.dir = 'rtl';
  }
}; // end of localizePage

// Parse a URL. Based upon http://blog.stevenlevithan.com/archives/parseuri
// parseUri 1.2.2, (c) Steven Levithan <stevenlevithan.com>, MIT License
// Inputs: url: the URL you want to parse
// Outputs: object containing all parts of |url| as attributes
const parseUriRegEx = /^(([^:]+(?::|$))(?:(?:\w+:)?\/\/)?(?:[^:@/]*(?::[^:@/]*)?@)?(([^:/?#]*)(?::(\d*))?))((?:[^?#/]*\/)*[^?#]*)(\?[^#]*)?(#.*)?/;
const parseUri = function (url) {
  const matches = parseUriRegEx.exec(url);

  // The key values are identical to the JS location object values for that key
  const keys = ['href', 'origin', 'protocol', 'host', 'hostname', 'port',
    'pathname', 'search', 'hash'];
  const uri = {};
  for (let i = 0; (matches && i < keys.length); i++) {
    uri[keys[i]] = matches[i] || '';
  }
  return uri;
};

// Parses the search part of a URL into a key: value object.
// e.g., ?hello=world&ext=adblock would become {hello:"world", ext:"adblock"}
// Inputs: search: the search query of a URL. Must have &-separated values.
parseUri.parseSearch = function parseSearch(searchQuery) {
  const params = {};
  let search = searchQuery;
  let pair;

  // Fails if a key exists twice (e.g., ?a=foo&a=bar would return {a:"bar"}
  search = search.substring(search.indexOf('?') + 1).split('&');

  for (let i = 0; i < search.length; i++) {
    pair = search[i].split('=');
    if (pair[0] && !pair[1]) {
      pair[1] = '';
    }
    const pairKey = decodeURIComponent(pair[0]);
    const pairValue = decodeURIComponent(pair[1]);
    if (pairKey && pairValue !== 'undefined') {
      params[pairKey] = pairValue;
    }
  }
  return params;
};

// Strip third+ level domain names from the domain and return the result.
// Inputs: domain: the domain that should be parsed
// keepDot: true if trailing dots should be preserved in the domain
// Returns: the parsed domain
parseUri.secondLevelDomainOnly = function stripThirdPlusLevelDomain(domain, keepDot) {
  if (domain) {
    const match = domain.match(/([^.]+\.(?:co\.)?[^.]+)\.?$/) || [domain, domain];
    return match[keepDot ? 0 : 1].toLowerCase();
  }

  return domain;
};

// Inputs: key:string.
// Returns value if key exists, else undefined.
const sessionStorageGet = function (key) {
  const json = sessionStorage.getItem(key);
  if (json == null) {
    return undefined;
  }
  try {
    return JSON.parse(json);
  } catch (e) {
    log(`Couldn't parse json for ${key}`);
    return undefined;
  }
};

// Inputs: key:string.
// Returns value if key exists, else undefined.
const sessionStorageSet = function (key, value) {
  if (value === undefined) {
    sessionStorage.removeItem(key);
    return;
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (ex) {
    if (ex.name === 'QUOTA_EXCEEDED_ERR') {
      // eslint-disable-next-line no-alert
      alert(translate('storage_quota_exceeded'));
      openTab('options/index.html#ui-tabs-2');
    }
  }
};

// Inputs: key:string.
// Returns object from localStorage.
// The following two functions should only be used when
// multiple 'sets' & 'gets' may occur in immediately preceding each other
// chrome.storage.local.get & set instead
const storageGet = function (key) {
  const store = localStorage;
  const json = store.getItem(key);
  if (json == null) {
    return undefined;
  }
  try {
    return JSON.parse(json);
  } catch (e) {
    log(`Couldn't parse json for ${key}`, e);
    return undefined;
  }
};

// Inputs: key:string, value:object.
// Returns undefined.
const storageSet = function (key, value) {
  const store = localStorage;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch (ex) {
    // eslint-disable-next-line no-console
    console.log(ex);
  }
};

const chromeStorageSetHelper = function (key, value, callback) {
  const items = {};
  items[key] = value;
  chrome.storage.local.set(items).then(() => {
    if (typeof callback === 'function') {
      callback();
    }
  }).catch((error) => {
    if (typeof callback === 'function') {
      callback(error);
    }
  });
};

const chromeStorageGetHelper = function (storageKey) {
  return new Promise(((resolve, reject) => {
    chrome.storage.local.get(storageKey).then((items) => {
      resolve(items[storageKey]);
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      reject(error);
    });
  }));
};

const chromeLocalStorageOnChangedHelper = function (storageKey, callback) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') {
      return;
    }
    for (const key in changes) {
      if (key !== storageKey) {
        return;
      }
      callback();
    }
  });
};

const reloadOptionsPageTabs = function () {
  const optionTabQuery = {
    url: `chrome-extension://${chrome.runtime.id}/options.html*`,
  };
  chrome.tabs.query(optionTabQuery).then((tabs) => {
    for (const i in tabs) {
      chrome.tabs.reload(tabs[i].id);
    }
  });
};

const reloadAllOpenedTabs = function () {
  const optionTabQuery = {
    url: `chrome-extension://${chrome.runtime.id}/*`,
  };
  chrome.tabs.query(optionTabQuery).then((tabs) => {
    for (const i in tabs) {
      chrome.tabs.reload(tabs[i].id);
    }
  });
};

// selected attaches a click and keydown event handler to the matching selector and calls
// the handler if a click or keydown event occurs (with a CR or space is pressed). We support
// both mouse and keyboard events to increase accessibility of the popup menu.
// Returns a reference to the keydown handler for future removal.
const selected = function (selector, handler) {
  const $matched = $(selector);
  $matched.click(handler);
  function keydownHandler(event) {
    if (event.which === 13 || event.which === 32) {
      handler(event);
    }
  }
  $matched.keydown(keydownHandler);
  return keydownHandler;
};

// selectedOff removes a click and keydown event handler from the matching selector.
const selectedOff = function (selector, clickHandler, keydownHandler) {
  const $matched = $(selector);
  $matched.off('click', clickHandler);
  $matched.off('keydown', keydownHandler);
};

// selectedOnce adds event listeners to the given element for mouse click or keydown CR or space
// events which runs the handler and immediately removes the event handlers so it cannot fire again.
const selectedOnce = function (element, handler) {
  if (!element) {
    return;
  }
  const clickHandler = function () {
    element.removeEventListener('click', clickHandler);
    handler();
  };
  element.addEventListener('click', clickHandler);

  const keydownHandler = function (event) {
    if (event.keyCode === 13 || event.keyCode === 32) {
      element.removeEventListener('keydown', keydownHandler);
      handler();
    }
  };
  element.addEventListener('keydown', keydownHandler);
};

// Join 2 or more sentences once translated.
// Inputs: arg:str -- Each arg is the string of a full sentence in message.json
const i18nJoin = function (...args) {
  let joined = '';
  for (let i = 0; i < args.length; i++) {
    const isLastSentence = i + 1 === args.length;
    if (!isLastSentence) {
      joined += `${translate(args[i])} `;
    } else {
      joined += `${translate(args[i])}`;
    }
  }
  return joined;
};

Object.assign(window, {
  sessionStorageSet,
  sessionStorageGet,
  storageGet,
  storageSet,
  parseUri,
  determineUserLanguage,
  getUILanguage,
  chromeStorageSetHelper,
  logging,
  translate,
  chromeStorageGetHelper,
  reloadOptionsPageTabs,
  reloadAllOpenedTabs,
  chromeLocalStorageOnChangedHelper,
  selected,
  selectedOnce,
  i18nJoin,
});

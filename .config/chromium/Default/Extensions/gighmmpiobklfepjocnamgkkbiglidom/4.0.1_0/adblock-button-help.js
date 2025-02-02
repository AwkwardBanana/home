'use strict';

/* For ESLint: List any global identifiers used in this file below */
/* global selectedOff, selected, BG, page, popupMenuHelpActionMap,
  localizePage, DOMPurify */

let cleanButtonHTML;
let cleanSegueHTML;
let cleanSectionHTML;
let segueBreadCrumb = [];
let popupMenuHelpMap = {};
let filterUpdateError = false;
let logSent = false;
let closeKeydownHandler;
let backKeydownHandler;

const logHelpFlowResults = function (source) {
  logSent = true;
  BG.recordGeneralMessage('help_flow_results', undefined, { hfd: `${segueBreadCrumb},${source}` });
};

$(window).unload(() => {
  if (!logSent) {
    logHelpFlowResults('popupClosed');
  }
});

const reset = function () {
  segueBreadCrumb = [];
  $('#help_content').empty();
  $('#wrapper').show();
  $('#help_overlay').hide();
  // eslint-disable-next-line no-use-before-define
  selectedOff('#close_icon', closeClickHandler, closeKeydownHandler);
  // eslint-disable-next-line no-use-before-define
  selectedOff('#back_icon', backClickHandler, backKeydownHandler);
  filterUpdateError = false;
};

// Show the next help page.
// Inputs: segueToId:string - the property in the help-map object to show next
//         backIconClicked:boolean (optional) - if true, indicates that the back button was clicked
//                                              and we shouldn't save the 'segueToId' paramter in
//                                              the segueBreadCrumb array
//
const transitionTo = function (segueToId, backIconClicked) {
  const nextHelpPage = popupMenuHelpMap[segueToId];
  if (!nextHelpPage) {
    return;
  }
  const $content = $('#help_content');
  $content.empty();
  if (!backIconClicked) {
    segueBreadCrumb.push(segueToId);
  }
  if (nextHelpPage.title) {
    $('#help_title').attr('i18n', nextHelpPage.title);
  }
  const $textContainer = $('<div id="text_container">');
  $content.append($textContainer, { SAFE_FOR_JQUERY: true });
  // process any segues - will be displayed first
  if (Array.isArray(nextHelpPage.segues)) {
    for (const segue of nextHelpPage.segues) {
      const $cleanCloneSegueHTML = $(cleanSegueHTML, { SAFE_FOR_JQUERY: true });
      $cleanCloneSegueHTML.find('.segue-text').attr('i18n', segue.content);
      selected($cleanCloneSegueHTML.find('.segue-box'), () => {
        const paused = BG.adblockIsPaused();
        const domainPaused = BG.adblockIsDomainPaused({ url: page.url.href, id: page.id });
        if (segue.segueToIfPaused && (paused || domainPaused)) {
          transitionTo(segue.segueToIfPaused);
          return;
        }
        if (segue.segueToIfWhitelisted && BG.checkWhitelisted(page)) {
          transitionTo(segue.segueToIfWhitelisted);
          return;
        }
        transitionTo(segue.segueTo);
      });
      $textContainer.append($cleanCloneSegueHTML, { SAFE_FOR_JQUERY: true });
    }
  }
  // sections
  if (Array.isArray(nextHelpPage.sections)) {
    for (const section of nextHelpPage.sections) {
      const $cleanCloneSectionHTML = $(cleanSectionHTML, { SAFE_FOR_JQUERY: true });
      $textContainer.append($cleanCloneSectionHTML, { SAFE_FOR_JQUERY: true });
      for (const content of section.content) {
        const textSpan = $('<span tabindex="0" class="section-text"></span>');
        $cleanCloneSectionHTML.find('.section-box').append(textSpan);
        if (content.linkURL) {
          const linkAnchor = $('<a href="#" target="_blank" tabindex="0">');
          // create a random String to use an id for the i18n processing
          const randLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
          const randNumber = Date.now() + Math.floor(Math.random() * 1000000);
          const i18nReplacementElId = randLetter + randNumber;
          linkAnchor.attr('id', i18nReplacementElId);
          selected(linkAnchor, () => {
            BG.openTab(content.linkURL);
            logHelpFlowResults('link');
            reset();
          });
          textSpan.attr('i18n_replacement_el', i18nReplacementElId);
          textSpan.append(document.createTextNode(' '));
          textSpan.append(linkAnchor);
          textSpan.append(document.createTextNode(' '));
        }
        textSpan.attr('i18n', content.text);
        textSpan.after('&nbsp;');
      }
    }
  }
  // buttons
  if (Array.isArray(nextHelpPage.buttons)) {
    const $buttonContainer = $('<div class="button-container">');
    let multipleButton = false;
    if (nextHelpPage.buttons.length > 1) {
      multipleButton = true;
    }
    for (const button of nextHelpPage.buttons) {
      const $cleanCloneButtonHTML = $(cleanButtonHTML, { SAFE_FOR_JQUERY: true });
      $cleanCloneButtonHTML.find('.button-text').attr('i18n', button.text);
      if (button.icon) {
        $cleanCloneButtonHTML.find('.button-icon').text(button.icon);
      } else {
        $cleanCloneButtonHTML.find('.button-icon').hide();
      }
      selected($cleanCloneButtonHTML, () => {
        if (popupMenuHelpActionMap[button.action]) {
          popupMenuHelpActionMap[button.action]();
        }
      });
      if (multipleButton) {
        $cleanCloneButtonHTML.addClass('multiple-button');
      }
      $buttonContainer.append($cleanCloneButtonHTML, { SAFE_FOR_JQUERY: true });
    }
    $content.append($buttonContainer, { SAFE_FOR_JQUERY: true });
  }
  if (nextHelpPage.footer) {
    $('#help_footer').show();
    $('#help_footer').attr('i18n', nextHelpPage.footer);
  } else {
    $('#help_footer').hide();
  }
  localizePage();
  if (backIconClicked) {
    $content.addClass('previousPage');
    $content.one('animationend', () => {
      $content.removeClass('previousPage');
    });
  } else {
    $content.addClass('nextPage');
    $content.one('animationend', () => {
      $content.removeClass('nextPage');
    });
  }
};

const closeClickHandler = function () {
  logHelpFlowResults('closeIcon');
  reset();
};

const backClickHandler = function () {
  if (segueBreadCrumb.length > 1) {
    segueBreadCrumb.pop(); // remove current page
    const lastSegueId = segueBreadCrumb[segueBreadCrumb.length - 1]; // now get the previous page
    transitionTo(lastSegueId, true);
    filterUpdateError = false;
  } else {
    logHelpFlowResults('backIcon');
    reset();
  }
};

const loadHTMLSegments = function () {
  const helpSegueRequest = fetch('adblock-button-help-segue.html').then(response => response.text());
  const helpOkayRequest = fetch('adblock-button-help-button.html').then(response => response.text());
  const helpSectionRequest = fetch('adblock-button-help-section.html').then(response => response.text());
  const helpMapRequest = fetch('adblock-button-help-map.json').then(response => response.json());
  return Promise.all([
    helpSegueRequest,
    helpOkayRequest,
    helpSectionRequest,
    helpMapRequest,
  ]).then((values) => {
    cleanSegueHTML = DOMPurify.sanitize(values[0]);
    cleanButtonHTML = DOMPurify.sanitize(values[1]);
    cleanSectionHTML = DOMPurify.sanitize(values[2]);
    [, , , popupMenuHelpMap] = values;
  });
};

const postLoadInitialize = function () {
  reset();
  const startConfig = popupMenuHelpMap.start;
  if (startConfig.footer) {
    $('#help_footer').attr('i18n', startConfig.footer);
  } else {
    $('#help_footer').hide();
  }
  closeKeydownHandler = selected('#close_icon', closeClickHandler);
  backKeydownHandler = selected('#back_icon', backClickHandler);
  transitionTo('start');
  $('#wrapper').hide();
  $('#help_overlay').show();
  $('#separator_help').show();
};

const showHelpSetupPage = function () {
  loadHTMLSegments().then(() => {
    postLoadInitialize();
  });
};

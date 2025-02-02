'use strict';

/* For ESLint: List any global identifiers used in this file below */
/* global backgroundPage, channelsNotifier, License, localizePage, MABPayment */


(function onImageSwapLoaded() {
  const { channels, setSetting } = backgroundPage;

  const loadCurrentSettingsIntoPage = function () {
    const guide = channels.getGuide();
    const $stopFeatureInput = $('input#no-channel');
    let atLeastOneSelected = false;

    for (const id in guide) {
      const $channelInput = $(`#${guide[id].name}`);
      const isEnabled = guide[id].enabled;
      $channelInput.prop('checked', isEnabled);
      $channelInput.data('channel-id', id);

      if (isEnabled) {
        atLeastOneSelected = true;
        $channelInput.parent('.channel-box').addClass('selected');
      } else {
        $channelInput.parent('.channel-box').removeClass('selected');
      }
    }

    if (atLeastOneSelected) {
      setSetting('picreplacement', true);
      $stopFeatureInput.prop('checked', false);
      $stopFeatureInput.parent('.channel-box').removeClass('selected');
    } else {
      setSetting('picreplacement', false);
      $stopFeatureInput.prop('checked', true);
      $stopFeatureInput.parent('.channel-box').addClass('selected');
    }
  };

  const updateChannelSelection = function (event) {
    const $eventTarget = $(event.target);
    const channelId = $eventTarget.data('channel-id');
    const enabled = $eventTarget.is(':checked');

    if (!channelId) {
      return;
    }

    if (channelId === 'none') {
      channels.disableAllChannels();
    } else {
      channels.setEnabled(channelId, enabled);
    }

    loadCurrentSettingsIntoPage();
  };

  const freeUserSetup = function () {
    $('input.invisible-overlay').prop('hidden', true);
    $('.channel-box > a[id^=get-it-now]').closest('li').addClass('locked');
    $('.channel-box').first().closest('li').addClass('selected');
    $('.locked > a[id^=get-it-now]').each((i, linkWithoutUserId) => {
      const link = linkWithoutUserId;
      link.href = License.MAB_CONFIG.payURL;
    });

    // Events
    $('.locked > a[id^=get-it-now]').hover(
      () => $('#get-it-now-image-swap').addClass('shadow'),
      () => $('#get-it-now-image-swap').removeClass('shadow'),
    );
  };

  const paidUserSetup = function () {
    $('input.invisible-overlay').removeAttr('hidden');
    $('.channel-box > a[id^=get-it-now]').prop('hidden', true);
    $('.channel-box').removeClass('locked');

    // Events
    $('input.invisible-overlay').change(updateChannelSelection);
  };

  $(document).ready(() => {
    localizePage();

    if (!License || $.isEmptyObject(License)) {
      return;
    }

    const payInfo = MABPayment.initialize('image-swap');
    if (License.shouldShowMyAdBlockEnrollment()) {
      MABPayment.freeUserLogic(payInfo);
      freeUserSetup();
    } else if (License.isActiveLicense()) {
      MABPayment.paidUserLogic(payInfo);
      paidUserSetup();
      loadCurrentSettingsIntoPage();
    }

    const onChannelsChanged = function (id, currentValue, previousValue) {
      const guide = backgroundPage.channels.getGuide();
      const $channelInput = $(`#${guide[id].name}`);
      if ($channelInput.is(':checked') === previousValue) {
        $channelInput.click();
      }
    };

    window.addEventListener('unload', () => {
      channelsNotifier.off('channels.changed', onChannelsChanged);
    });

    channelsNotifier.on('channels.changed', onChannelsChanged);
  });
}());

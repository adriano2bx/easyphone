'use strict';

const { PhoneEngine, defaultAudio } = require('./phone-engine.cjs');
const { PhoneError } = require('./errors.cjs');
const { validateAccountDraft } = require('./validation.cjs');
const { pickLocalAddress } = require('./baresip-config.cjs');

module.exports = {
  PhoneEngine,
  PhoneError,
  defaultAudio,
  pickLocalAddress,
  validateAccountDraft,
  createPhoneEngine: (options) => new PhoneEngine(options),
};

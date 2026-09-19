const { act } = require('./agent/orchestrator')
const { ensureAssistPrompt } = require('./agent/model')

module.exports = {
  act,
  ensureAssistPrompt
}

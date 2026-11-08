'use strict';
const ROLE_META = Object.freeze({
  wolf:       { faction:'wolf', icon:'🐺', tag:'PHE SÓI', kind:'wolf' },
  white_wolf: { faction:'wolf', icon:'🐺', tag:'PHE SÓI', kind:'wolf' },
  wolf_cub:   { faction:'wolf', icon:'🐾', tag:'PHE SÓI', kind:'wolf' },
  silencer:   { faction:'wolf', icon:'🌑', tag:'PHE SÓI', kind:'wolf' },
  seer:       { faction:'village', icon:'🔮', tag:'PHE DÂN', kind:'power' },
  witch:      { faction:'village', icon:'🧪', tag:'PHE DÂN', kind:'power' },
  guard:      { faction:'village', icon:'🛡️', tag:'PHE DÂN', kind:'power' },
  hunter:     { faction:'village', icon:'🏹', tag:'PHE DÂN', kind:'power' },
  cupid:      { faction:'village', icon:'💘', tag:'PHE DÂN', kind:'power' },
  fox:        { faction:'village', icon:'🦊', tag:'PHE DÂN', kind:'power' },
  elder:      { faction:'village', icon:'🌳', tag:'PHE DÂN', kind:'passive' },
  idiot:      { faction:'village', icon:'🎭', tag:'PHE DÂN', kind:'passive' },
  prince:     { faction:'village', icon:'👑', tag:'PHE DÂN', kind:'passive' },
  priest:     { faction:'village', icon:'✨', tag:'PHE DÂN', kind:'power' },
  detective:  { faction:'village', icon:'🕵️', tag:'PHE DÂN', kind:'power' },
  raven:      { faction:'village', icon:'🪶', tag:'PHE DÂN', kind:'power' },
  villager:   { faction:'village', icon:'🧑‍🌾', tag:'PHE DÂN', kind:'basic' }
});
const SPECIAL_ROLES = Object.keys(ROLE_META).filter(k=>k!=='villager');
const WOLF_ROLES = Object.keys(ROLE_META).filter(k=>ROLE_META[k].faction==='wolf');
const ROLE_PRIORITY = ['seer','guard','witch','hunter','cupid','detective','fox','raven','priest','elder','idiot','prince'];
module.exports = {ROLE_META,SPECIAL_ROLES,WOLF_ROLES,ROLE_PRIORITY};

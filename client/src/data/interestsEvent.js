// The name of the window event fired when someone saves their asset classes.
//
// Its own module so the sender and the listeners can share it without sharing
// a bundle. InterestPicker pulls in the theme list, the icon set and the sound
// effects; PriceTicker sits in the header and loads on every page, so
// importing the picker just to read one string would put all of that on the
// critical path of pages that never show it.
export const INTERESTS_EVENT = 'wl:interests'

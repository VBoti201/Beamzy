// Chromium's backdrop-filter blur has a known compositing bug on some
// Windows GPU configurations — instead of staying scoped to the modal
// overlay, it can bleed into (and get stuck haz­ing over) the whole
// window, especially right as another surface like a native error dialog
// pops on top. Safer to just skip the blur there; the darkened overlay
// alone still reads fine as a modal backdrop.
export const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')

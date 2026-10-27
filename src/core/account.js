// The game result controller opens the React-owned account dialog through this bridge.
let open = null;
export function bindAuthModal(handler) { open = handler; return () => { open = null; }; }
export function openAuthModal(onSuccess = null) { return open ? (open(onSuccess), true) : false; }

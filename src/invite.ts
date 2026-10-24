// Room codes are public routing hints, never authentication. Preserve literals.
export function inviteCode(url: URL): string | null {
 const values=url.searchParams.getAll('room');
 const literal=url.search.slice(1).split('&').filter(part=>part.startsWith('room='));
 return values.length===1 && literal.length===1 && /^room=[A-Z0-9]{6}$/.test(literal[0]) ? values[0] : null;
}
export function inviteSuffix(url: URL): string { const code=inviteCode(url);return code ? `?room=${code}` : ''; }
export function roomInvite(code: string, origin=window.location.origin): string {
 if(!/^[A-Z0-9]{6}$/.test(code))throw Error('Invalid invite code');
 return `${origin}/?room=${code}`;
}
export function loopbackInvite(host=window.location.hostname): boolean { return ['localhost','127.0.0.1','[::1]','::1'].includes(host); }

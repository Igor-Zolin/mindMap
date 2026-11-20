const userIdPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function sameDigest(left, right) {
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return new Uint8Array(digest);
}

function parseUsers(json) {
  const users = JSON.parse(json);
  if (!users || typeof users !== 'object' || Array.isArray(users) || !Object.keys(users).length) {
    throw new Error('Expected a nonempty user registry');
  }

  const keys = new Set();
  return Object.entries(users).flatMap(([id, hashes]) => {
    if (!userIdPattern.test(id) || ['constructor', 'prototype', '__proto__'].includes(id) ||
        !Array.isArray(hashes) || !hashes.length) {
      throw new Error('Invalid user registry');
    }
    return hashes.map(hash => {
      if (typeof hash !== 'string' || !/^[\da-f]{64}$/i.test(hash) || keys.has(hash.toLowerCase())) {
        throw new Error('Invalid or duplicate key hash');
      }
      keys.add(hash.toLowerCase());
      return { id, digest: Uint8Array.from(hash.match(/../g), byte => parseInt(byte, 16)) };
    });
  });
}

export function createAuthenticator({ usersJson, token } = {}) {
  let users;
  try {
    if (usersJson !== undefined) users = Promise.resolve(parseUsers(usersJson));
    else if (token) users = tokenHash(token).then(digest => [{ id: 'owner', digest }]);
  } catch {
    // Invalid configuration fails closed for every endpoint.
  }

  return async request => {
    if (!users) return null;
    const match = /^Bearer ([^\s]{1,512})$/i.exec(request.headers.get('Authorization') || '');
    if (!match) return false;
    const digest = await tokenHash(match[1]);
    let userId = false;
    for (const user of await users) {
      if (sameDigest(digest, user.digest)) userId = user.id;
    }
    return userId;
  };
}

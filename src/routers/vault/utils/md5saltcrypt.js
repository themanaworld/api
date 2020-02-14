// password hashing for the Legacy server
// https://gitlab.com/evol/evol-hercules/blob/master/src/elogin/md5calc.c
// https://github.com/themanaworld/tmwa/blob/c82c9741bc1a0b110bccce1bcc76903a6e747a00/src/high/md5more.cpp

const crypto = require("crypto"); // native

// generate md5 from string
const md5 = (str) => crypto.createHash("md5").update(str).digest("hex");

// weak md5 password hashing and salting (eAthena)
const md5saltcrypt = (salt, plain) => md5(md5(plain) + md5(salt)).slice(0, -8);

// check plain password against its salted hash
const verify = (salt, hashed, plain) => md5saltcrypt(salt, plain) === hashed;

// takes apart a password string (!salt$hash) and verifies it
const verify_ea = (raw, plain) => verify(raw.slice(1, 6), raw.slice(-24), plain);

// generate a new salt
const new_salt = () => {
    let salt = "";
    do {
        salt += String.fromCharCode(Math.floor(78 * Math.random() + 48));
    } while (salt.length < 5);
    return salt;
};

// generate a password string with the given salt
const hash = (salt, plain) => `!${salt}$${md5saltcrypt(salt, plain)}`;

// generate a password string with a new salt
const hash_new = (plain) => hash(new_salt(), plain);


module.exports = {
    verify: verify_ea,
    hash: hash_new,
};

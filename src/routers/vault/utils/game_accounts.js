const LegacyAccount = require("../types/LegacyAccount.js");
const LegacyChar = require("../types/LegacyChar.js");
const EvolAccount = require("../types/EvolAccount.js");
const EvolChar = require("../types/EvolChar.js");

/**
 * fetch the legacy game accounts and cache in the Session
 * @param {*} req - the express request
 * @param {Session} session - the Session
 * @return {Promise<LegacyAccount[]>} a promise resolving to an array of LegacyAccount
 */
const get_legacy_accounts = async (req, session) => {
    const accounts = [];
    const claimed = await req.app.locals.vault.claimed_legacy_accounts.findAll({
        where: {vaultId: session.vault},
    });

    for (const acc_ of claimed) {
        const acc = await req.app.locals.legacy.login.findByPk(acc_.accountId);

        if (acc === null || acc === undefined) {
            // unexpected: account was deleted
            console.info(`Vault.legacy.account: unlinking deleted account ${acc_.accountId} <${session.vault}@vault> [${req.ip}]`);
            await acc_.destroy(); // un-claim the account
            continue;
        }

        const account = new LegacyAccount(acc.accountId, acc.userid);
        account.revoltId = acc.revoltId;

        const chars = await req.app.locals.legacy.char.findAll({
            where: {accountId: acc.accountId},
        });

        for (const char of chars) {
            const char_ = new LegacyChar(account, char.charId, char.name);
            char_.baseLevel = char.baseLevel;
            char_.gender = char.sex;
            char_.revoltId = char.revoltId;

            account.chars.push(char_);
        }

        accounts.push(account);
    }

    session.legacyAccounts = accounts;
    return accounts;
};

/**
 * fetch the evol game accounts and cache in the Session
 * @param {*} req - the express request
 * @param {Session} session - the Session
 * @return {Promise<EvolAccount[]>} a promise resolving to an array of EvolAccount
 */
const get_account_list = async (req, session) => {
    const accounts = [];
    const claimed = await req.app.locals.vault.claimed_game_accounts.findAll({
        where: {vaultId: session.vault},
    });

    for (const acc_ of claimed) {
        const acc = await req.app.locals.evol.login.findByPk(acc_.accountId);

        if (acc === null || acc === undefined) {
            // unexpected: account was deleted
            console.info(`Vault.evol.account: unlinking deleted account ${acc_.accountId} <${session.vault}@vault> [${req.ip}]`);
            await acc_.destroy(); // un-claim the account
            continue;
        }

        const account = new EvolAccount(acc.accountId, acc.userid);

        // check if this is an imported account
        for (const legacy_acc of session.legacyAccounts) {
            if (legacy_acc.revoltId === account.accountId) {
                account.legacyId = legacy_acc.accountId;

                // two-way binding
                account.legacyAccount = legacy_acc;
                legacy_acc.revoltAccount = account;
                break;
            }
        }

        const chars = await req.app.locals.evol.char.findAll({
            where: {accountId: acc.accountId},
        });

        for (const char of chars) {
            const char_ = new EvolChar(account, char.charId, char.name);
            char_.baseLevel = char.baseLevel;
            char_.gender = char.sex;

            // check if this is an imported char
            for (const legacy_acc of session.legacyAccounts) {
                for (const legacy_char of legacy_acc.chars) {
                    if (legacy_char.revoltId === char_.charId) {
                        char_.legacyId = legacy_char.charId;

                        // two-way binding
                        char_.legacyChar = legacy_char;
                        legacy_char.revoltChar = char_;
                        break;
                    }
                }
            }

            account.chars.push(char_);
        }

        accounts.push(account);
    }

    session.gameAccounts = accounts;
    return accounts;
};

module.exports = {
    get_evol: get_account_list,
    get_legacy: get_legacy_accounts,
};

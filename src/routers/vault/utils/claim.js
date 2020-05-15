const { Op } = require("sequelize");
const LegacyAccount = require("../types/LegacyAccount.js");
const LegacyChar = require("../types/LegacyChar.js");

// claim by email // TODO: DRY this
const claim_accounts = async (req, email, vault_id, session = null) => {
    const locals = req.app.locals;

    if (email === null || email.length < 5 || email === "a@a.com")
        return Promise.resolve(false);

    if (session === null) {
        for (const [key, sess] of locals.session) {
            // try to find the session
            if (sess.authenticated === true && sess.vault === vault_id) {
                session = sess;
            }
        }
    }

    // TODO: make these operations less expensive (foreign keys could help)
    let already_claimed = await locals.vault.claimed_legacy_accounts.findAll({
        where: {vaultId: vault_id},
    });

    already_claimed = already_claimed.map(acc => {
        return {accountId: {
            [Op.not]: acc.accountId, // NOTE: if query is larger than 65535 this will throw
        }};
    });

    const to_claim = await locals.legacy.login.findAll({
        where: {
            email: email,
            [Op.and]: already_claimed,
        },
    });

    for (const acc of to_claim) {
        await locals.vault.claimed_legacy_accounts.create({
            accountId: acc.accountId,
            vaultId: vault_id,
        });

        req.app.locals.vault.account_log.create({
            vaultId: vault_id,
            accountType: "LEGACY",
            actionType: "LINK",
            accountId: acc.accountId,
            ip: req.ip,
        });

        if (session !== null) {
            const chars_ = await locals.legacy.char.findAll({
                where: {accountId: acc.accountId},
            });

            const legacy_account = new LegacyAccount(acc.accountId, acc.userid);
            legacy_account.revoltId = acc.revoltId;

            for (const char of chars_) {
                const legacy_char = new LegacyChar(legacy_account, char.charId, char.name);
                legacy_char.revoltId = char.revoltId;
                legacy_char.baseLevel = char.baseLevel;
                legacy_char.gender = char.sex;

                const char_vars = await req.app.locals.legacy.char_reg.findAll({
                    where: {
                        charId: char.charId,
                        [Op.or]: [
                            {name: "TUT_var"},
                            {name: "BOSS_POINTS"},
                        ],
                    },
                    limit: 2, // for now we only use these 2 vars ^
                });

                for (const var_ of char_vars) {
                    if (var_.name === "TUT_var") {
                        legacy_char.creationTime = var_.value > 0xFF ? var_.value : 0;
                    } else if (var_.name === "BOSS_POINTS") {
                        legacy_char.bossPoints = Math.max(0, var_.value);
                    }

                    // in the future maybe here set the vars in a Map<name, value>
                }

                legacy_account.chars.push(legacy_char);
            }

            // add to session cache
            session.legacyAccounts.push(legacy_account);
        }

        locals.logger.info(`Vault.legacy.account: linked Legacy account ${acc.accountId} to Vault account <${vault_id}@vault> [${req.ip}]`);
    }

    // TODO: split TMWA claiming into its own function, add forums and wiki claiming
};

module.exports = {
    claim_accounts,
};

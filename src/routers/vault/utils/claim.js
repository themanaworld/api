const { Op } = require("sequelize");

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
            ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
        });

        if (session !== null) {
            const chars = [];
            const chars_ = await locals.legacy.char.findAll({
                where: {accountId: acc.accountId},
            });

            for (const char of chars_) {
                chars.push({
                    name: char.name,
                    charId: char.charId,
                    revoltId: char.revoltId,
                    level: char.baseLevel,
                    sex: char.sex,
                });
            }
            // add to session cache
            session.legacyAccounts.push({
                name: acc.userid,
                accountId: acc.accountId,
                revoltId: acc.revoltId,
                chars,
            });
        }

        locals.logger.info(`Vault: linked Legacy account ${acc.accountId} to Vault account {${vault_id}} [${req.ip}]`);
    }

    // TODO: split TMWA claiming into its own function, add forums and wiki claiming
};

module.exports = {
    claim_accounts,
};

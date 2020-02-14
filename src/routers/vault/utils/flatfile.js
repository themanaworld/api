const execFile = require("child_process").execFile;
const ripgrep = require("ripgrep-bin");

const execAsync = (cmd, par) =>
    new Promise((resolve, reject) =>
        execFile(cmd, par, (error, stdout, stderr) =>
            resolve(error ? "" : (stdout ? stdout : stderr))));

const tmwa_account_regex = new RegExp("^(?<id>[0-9]+)\t(?<name>[^\t]+)\t(?<password>[^\t]+)\t");

const parseAccountLine = (line) => {
    const { groups: account } = tmwa_account_regex.exec(line);
    return {
        id: +account.id,
        name: account.name,
        password: account.password,
    };
}

const findAccount = async (account_id, name) => {
    const regex = `^${account_id}\t${name}\t`;
    const stdout = await execAsync(ripgrep, ["--case-sensitive", `--max-count=1`, regex, "account.txt"]);
    let account = null;
    if (stdout.length)
        account = parseAccountLine(stdout.slice(0, -1).split("\n")[0]);
    return account;
};

module.exports = {
    findAccount,
};

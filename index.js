const core = require('@actions/core');
const github = require('@actions/github');

const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const colors = require('colors');
const {IncomingWebhook} = require('@slack/webhook');
const nodemailer = require('nodemailer');
colors.setTheme({
  info: 'magenta',
  help: 'cyan',
  warn: 'yellow',
  success: 'green',
  error: ['red', 'bold']
});

const {program} = require('commander');
program.version('0.0.1');

program
  .option('-d, --debug', 'Print debug info')
  .option('-v, --vault <vaultName>', 'Name of the keyvault to check')
  .option('-it, --ignoreTags <tags>', 'If a secrets has any of these tags, they will be ignored', (val, memo) => [...memo, val], [])
  .option('--notifyBy <slack|email>', 'How to send alerts. Prints to console if blank', '')
  .option('--to <recipient|channel>', 'Where to send alerts (recipient or slack channel). If email, can be multiple values', (val, memo) => [...memo, val], [])

program.addHelpText('after', `

Ensure you have the required authentication set up in your environment:
$ export AZURE_CLIENT_ID=[SERVICE_PRINCIPAL_ID]
$ export AZURE_CLIENT_SECRET=[SERVICE_PRINCIPAL_PASSWORD]
$ export AZURE_TENANT_ID=[AZURE_TENANT_ID]

To send email:
$ export MAILSERVER_PASSWORD=PASSWORD
$ export MAILSERVER_USER=USER

To send via Slack:
$ export SLACK_WEBHOOK_URL=URL

Send alert via mail:
  $ node keyvault-checker.js -v keyvault-name --notifyBy email --to mail@mail.com [--to mail2@mail.com]

Send alert via Slack:
  $ node keyvault-checker.js -v keyvault-name --notifyBy slack --to channel

If notifyBy is omitted, warnings are printed to the console:
  $ node keyvault-checker.js -v keyvault-name

`);

program.parse(process.argv);

const options = program.opts();

const printError = (message) => {
  // Look at checking if running as an action (via context maybe?).
  // If possible, use console.log in CLI mode.
  core.setFailed(message);
}

try {
  // `who-to-greet` input defined in action metadata file
  options.vault = core.getInput('vault') || options.vault;
  options.notifyBy = core.getInput('notify-via') || options.notifyBy;
  options.to = core.getInput('to') || options.to;
  options.ignoreTags = core.getInput('ignore-tags') ? core.getInput('ignore-tags').join(',') : options.ignoreTags;
  options.debug = options.debug || core.getInput('debug');
  if (!options.vault) {
    throw new Error('No vault specified, bailing...');
  }
} catch (error) {
  core.setFailed(error.message);
  process.exit(1);
}

/**
 * @type Mail
 */
let transport;
/**
 * @type IncomingWebhook
 */
let webhook;

if (options.notifyBy === 'slack') {
  colors.disable();
  if (!process.env.SLACK_WEBHOOK_URL) {
    printError('No webhook url defined. Please set SLACK_WEBHOOK_URL in your environment'.error);
    process.exit(1);
  }
  if ((options.to || []).length === 0) {
    printError('When setting notifyBy to slack, the argument "to" is required.'.error)
    process.exit(1);
  }

  webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL, {
    title: 'Expired keyvault secrets',
    channel: options.to[0],
    icon_emoji: ':warning:',
    username: 'KeyvaultAlerts'
  });
}

if (options.notifyBy === 'email') {
  colors.disable();
  if ((options.to || []).length === 0) {
    printError('When setting notifyBy to email, the argument "to" is required.'.error)
    process.exit(1);
  }
  if (!process.env.MAILSERVER_PASSWORD) {
    printError('Missing password for mail-relay. Please set MAILSERVER_PASSWORD in your environment'.error);
    process.exit(1);
  }
  if (!process.env.MAILSERVER_USER) {
    printError('Missing user for mail-relay. Please set MAILSERVER_USER in your environment'.error);
    process.exit(1);
  }
  transport = nodemailer.createTransport({
    host: "mrrr.statoil.com",
    port: 25,
    secure: false,
    auth: {
      user: process.env.MAILSERVER_USER,
      pass: process.env.MAILSERVER_PASSWORD
    }
  });
  transport.transporter.verify()
    .then(() => console.log('Transporter OK'))
    .catch(ex => {
      printError('Transporter not working', ex);
      process.exit(1);
    })
}

const credential = new DefaultAzureCredential();

// Build the URL to reach your key vault
const vaultName = options.vault;
const url = `https://${vaultName}.vault.azure.net`;

// Lastly, create our secrets client and connect to the service
const client = new SecretClient(url, credential);

(async function() {
  const messages = [];
  try {
    for await (const secretProperties of client.listPropertiesOfSecrets()) {
      const secret = await client.getSecret(secretProperties.name);
      const ignoreTags = options.ignoreTags;
      const hasIgnoreTags = Object.keys(secret.properties.tags || {})
          .filter(t => ignoreTags.includes(t))
          .length > 0;
      if (hasIgnoreTags) {
        console.log('Ignoring', secret.name);
        continue;
      }
      const name = secret.name;
      let extra;
      let expiresOn = secret.properties.expiresOn;
      const oneMonth = 1000 * 60 * 60 * 24 * 31;
      const now = new Date().getTime();
      const createdOn = secret.properties.createdOn;
      if (!expiresOn) {
        const year = createdOn.getFullYear() + 1;
        expiresOn = new Date(createdOn.setFullYear(year));
        extra = `[INFO] ${name} has no expiry date set, assuming createdDate + 1 year`.info;
      }
      if (expiresOn.getTime() - oneMonth > now) {
        // still good
        if (extra) {
          messages.push({
            severity: 3,
            message: extra
          });
        }
      } else if (expiresOn.getTime() < now) {
        messages.push({
          severity: 0,
          message: `[CRIT] ${name} expired at ${expiresOn}`.error
        });
      } else {
        messages.push({
          severity: 1,
          message: `[WARN] ${name} expires in less than 30 days (${expiresOn})`.warn
        })
        if (extra) {
          messages.push({
            severity: 3,
            message: extra
          });
        }
      }
    }
  } catch (ex) {
    printError('Unable to get the secret-list from your keyvault'.error);
    if (!process.env.AZURE_CLIENT_ID ||
      !process.env.AZURE_CLIENT_SECRET ||
    !process.env.AZURE_TENANT_ID ) {
      printError('It seems like you have not set the required authentication-related environment variables'.error);
      printError('See usage (--help) to figure out which are required');
    } else {
      printError('The error stack was as follows:'.error)
      printError(ex);
    }
    process.exit(1);
  }
  messages
    .sort((a, b) => a.severity - b.severity);
  const hasErrorOrWarn = messages.filter(s => s.severity < 3)
    .length > 0;
  if (!hasErrorOrWarn) {
    console.log('No secrets expired / soon expiring'.success);
    process.exit(0);
  }
  switch (options.notifyBy) {
    case 'slack':
      sendSlack(messages);
      break;
    case 'email':
      sendMail(messages)
      break;
    default:
      print(messages);
  }
})();

function sendMail(messages) {
  const message = {
    from: "Azure Keyvault Notifier <noreply@equinor.com>",
    to: options.to,
    subject: "[Alert] Keyvault secrets are about to expire",
    text: messages.map(m => m.message).join('\n'),
    html: `<ul>
${messages.map(m => `<li style="${m.severity === 0 ? 'color: red;' : m.severity === 1 ? 'color: #99cc33;' : ''}">${m.message}</li>`).join('\n')}
</ul>`
  };
  transport.sendMail(message)
    .then(s => {
      console.log('Mail sent', s);
      process.exit(0);
    }).catch(ex => printError(ex));
}

function sendSlack(messages) {
  colors.disable();
  webhook.send(messages.map(m => colors.strip(m.message)).join('\n'))
    .then(() => console.log('Posted messages to slack'));
}

function print(messages) {
  messages
    .forEach(m => console.log(m.message));
}

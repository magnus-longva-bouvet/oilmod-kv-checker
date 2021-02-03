# Azure keyvault secret-expiry checker

#### Inputs
This action takes 3 inputs:
* vault -> name of the keyvault (required)
* notify-via -> slack or email. If left blank, output is printed to the console.
* to -> recipients (slack channel / user or email recipient.) (required if notify-via is set)


#### Ensure you have the required authentication set up in your environment:
```yaml
env:
  AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
  AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
  AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
  MAILSERVER_PASSWORD: ${{ secrets.MAILSERVER_PASSWORD }} # Only required if sending email
  MAILSERVER_USER: ${{ secrets.MAILSERVER_USER }} # Only required if sending email
  SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # Only required if notifying via slack
```


#### Example:
```yaml
name: Check AZ Keyvault
on:
  schedule:
    - cron: '0 3 * * *' # nightly tests run at 3 AM UTC
jobs:
  check:
    runs-on: ubuntu-latest
    name: Check AZ keyvault
    steps:
      - uses: equinor/oilmod-kv-checker
        with:
          notify-via: email
          to: 'mail@mail.com; mail2@mail.com'
          vault: my-secret-kv-name
          env:
            AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
            AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
            AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
            MAILSERVER_PASSWORD: ${{ secrets.MAILSERVER_PASSWORD }} # Only required if sending email
            MAILSERVER_USER: ${{ secrets.MAILSERVER_USER }} # Only required if sending email
            SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # Only required if notifying via slack
```

#### CLI:

Send alert via mail:
```shell script
$ node index.js -v keyvault-name --notifyBy email --to mail@mail.com [--to mail2@mail.com]
```

Send alert via Slack:
```shell script
  $ node index.js -v keyvault-name --notifyBy slack --to channel
```
If notifyBy is omitted, warnings are printed to the console:

```shell script
  $ node index.js -v keyvault-name
```

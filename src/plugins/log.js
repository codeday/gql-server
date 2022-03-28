import syslog from 'syslog-client';

const logger = syslog.createClient(process.env.SYSLOG_HOST, {
  port: process.env.SYSLOG_PORT,
  syslogHostname: `gql`,
});

export default {
  requestDidStart({ schemaHash, context: { req } }) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    return {
      validationDidStart({ source, queryHash, request }) {
        logger.log([
          queryHash,
          ip,
          `QUERY`,
          `"${source?.split(`\n`).filter((line) => Boolean(line.trim())).join(' ').replace(/"/g, `'`)}"`,
          schemaHash,
        ].join(' '));
        if (request?.variables) {
          logger.log([
            queryHash,
            ip,
            `QUERY_VARIABLES`,
            `"${JSON.stringify(request.variables)}"`,
            schemaHash,
          ].join(' '));
        }
        return (errs) => {
          (errs || []).forEach((e) => {
            logger.log([
              queryHash,
              ip,
              `PARSE_ERROR`,
              `"${e?.toString().split(`\n`).join('; ')}"`,
              `"${e?.stack?.split(`\n`).join('; ')}"`
            ].join(' '));
          });
        }
      },

      didEncounterErrors({ queryHash, errors }) {
        console.log(errors);
        (errors || []).forEach((e) => {
          logger.log([
            queryHash,
            ip,
            `EXEC_ERROR`,
            `"${e?.toString().split(`\n`).join('; ')}"`,
            `"${e?.stack?.split(`\n`).join('; ')}"`
          ].join(' '));
        });
      }
    }
  },
}

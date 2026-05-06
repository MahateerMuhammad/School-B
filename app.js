/**
 * cPanel/Passenger-friendly entry point.
 *
 * Keep this file at backend root so control panels can use
 * startup file "app.js" without nested path issues.
 */

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

require('./src/server')

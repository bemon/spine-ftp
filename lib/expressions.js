"use strict";
/**
 * Internal regexp expression used to parse ftp server responses
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RE_CMD_LINE = /(((^\d{3})[^\-]|(^\d{3})(\-))(.+))|(.+)/;
exports.RE_PWD = /"(.+)"(?: |$)/;
exports.RE_EPSV = /([\d]+)/;
exports.NEW_LINE = "\r\n";
exports.RE_SEP = /;/g;
exports.RE_EQ = /=/;
exports.RE_LAST_MOD_TIME = /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})/gm;
//# sourceMappingURL=expressions.js.map
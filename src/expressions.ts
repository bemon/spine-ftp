/**
 * Internal regexp expression used to parse ftp server responses
 */

export const RE_CMD_LINE = /(((^\d{3})[^\-]|(^\d{3})(\-))(.+))|(.+)/;
export const RE_PWD = /"(.+)"(?: |$)/;
export const RE_EPSV = /([\d]+)/;
export const NEW_LINE = "\r\n";
export const RE_SEP = /;/g;
export const RE_EQ = /=/;
export const RE_LAST_MOD_TIME = /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})/gm;
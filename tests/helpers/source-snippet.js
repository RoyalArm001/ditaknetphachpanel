'use strict';
// Structural smoke checks ignore formatting between tokens, while preserving
// quoted text and multi-character operators exactly. Behavioral tests run the
// original source; this helper never rewrites code before execution.
module.exports=function hasSourceSnippet(source,snippet){
  const tokens=snippet.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|=>|&&|\|\||\?\?|\?\.|==|!=|<=|>=|\S/g)||[];
  const escaped=tokens.map(token=>token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  return new RegExp(escaped.join('\\s*')).test(source);
};

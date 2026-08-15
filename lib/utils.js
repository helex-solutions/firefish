/** Send a conversion failure. Mirrors the original: 500 with the SUSHI/GoFSH result or error as body. */
function fail(res, err) {
  res.status(500).send(err);
}

module.exports = { fail };

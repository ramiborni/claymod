# Provider recordings

Response bodies the provider tests replay instead of calling the network.

The files in this folder were **written by hand from the providers' documented response shapes**
(M1 had no API keys to record with). When you have a key, replace a file with a real response:
make one request, save the body, and remove ids, keys and anything personal. Keep the file names
so the tests keep working.

Each file is `{ "status": <http status>, "body": <response JSON or string> }`.

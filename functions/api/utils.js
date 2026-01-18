/**
 * Creates a JSON response with appropriate headers.
 * @param {object} data The data to be sent as JSON.
 * @param {number} status The HTTP status code.
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

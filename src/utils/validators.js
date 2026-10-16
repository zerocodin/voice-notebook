/**
 * Minimal field validator — returns { ok, errors }.
 * rules: { fieldName: { required, type, min, max, match, enum } }
 */
function validate(body, rules) {
  const errors = {};

  for (const [field, rule] of Object.entries(rules)) {
    const value = body[field];

    if (rule.required && (value === undefined || value === null || value === "")) {
      errors[field] = `${field} is required`;
      continue;
    }
    if (value === undefined || value === null) continue;

    if (rule.type && typeof value !== rule.type) {
      errors[field] = `${field} must be a ${rule.type}`;
      continue;
    }
    if (typeof value === "string") {
      if (rule.min && value.trim().length < rule.min)
        errors[field] = `${field} must be at least ${rule.min} characters`;
      if (rule.max && value.trim().length > rule.max)
        errors[field] = `${field} must be at most ${rule.max} characters`;
      if (rule.match && !rule.match.test(value))
        errors[field] = `${field} is invalid`;
    }
    if (rule.enum && !rule.enum.includes(value)) {
      errors[field] = `${field} must be one of: ${rule.enum.join(", ")}`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

module.exports = { validate };
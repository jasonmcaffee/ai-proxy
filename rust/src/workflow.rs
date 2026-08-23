use serde_json::{Value, json};

const BASE_WORKFLOW: &str = include_str!("../jason-moody-zib-zit.json");
const DEFAULT_NEGATIVE: &str = "blurry, low-resolution, low-quality image, eerie appearance, extra arms, extra legs, ugly, noisy";

/// Builds a request-specific ComfyUI graph without mutating the embedded source workflow.
pub fn build_workflow(prompt: &str, negative_prompt: Option<&str>, size: Option<&str>) -> anyhow::Result<Value> {
    let mut workflow: Value = serde_json::from_str(BASE_WORKFLOW)?;
    let (width, height) = parse_size(size);
    set_input(&mut workflow, "45", "text", json!(prompt));
    let fallback = workflow.pointer("/490/inputs/text").and_then(Value::as_str).unwrap_or(DEFAULT_NEGATIVE).to_owned();
    set_input(&mut workflow, "490", "text", json!(negative_prompt.unwrap_or(&fallback)));
    set_input(&mut workflow, "516", "int", json!(width));
    set_input(&mut workflow, "518", "int", json!(height));
    set_input(&mut workflow, "520", "Number", json!(1.6));
    for index in 1..=3 {
        set_input(&mut workflow, "446", &format!("lora_{index}"), json!({ "on": true, "lora": "zit\\may_model_v1.safetensors", "strength": 0 }));
    }
    Ok(workflow)
}

/// Parses an OpenAI `WIDTHxHEIGHT` string or returns the legacy HD default.
pub fn parse_size(size: Option<&str>) -> (u32, u32) {
    let Some((width, height)) = size.and_then(|value| value.to_ascii_lowercase().split_once('x').map(|parts| (parts.0.to_owned(), parts.1.to_owned()))) else {
        return (1920, 1080);
    };
    match (width.parse::<u32>(), height.parse::<u32>()) {
        (Ok(width), Ok(height)) if width > 0 && height > 0 => (width, height),
        _ => (1920, 1080),
    }
}

/// Updates one workflow node input when the expected object structure exists.
fn set_input(workflow: &mut Value, node: &str, input: &str, value: Value) {
    if let Some(inputs) = workflow.get_mut(node).and_then(|node| node.get_mut("inputs")).and_then(Value::as_object_mut) {
        inputs.insert(input.to_owned(), value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies valid OpenAI dimensions are parsed exactly.
    #[test]
    fn parses_valid_size() {
        assert_eq!(parse_size(Some("1024x768")), (1024, 768));
    }

    /// Verifies missing, malformed, and zero sizes use the HD default.
    #[test]
    fn rejects_invalid_size() {
        assert_eq!(parse_size(None), (1920, 1080));
        assert_eq!(parse_size(Some("0x512")), (1920, 1080));
        assert_eq!(parse_size(Some("wide")), (1920, 1080));
    }

    /// Verifies request inputs change only the expected graph fields.
    #[test]
    fn builds_request_specific_workflow() {
        let workflow = build_workflow("sunrise", Some("rain"), Some("640x480")).unwrap();
        assert_eq!(workflow.pointer("/45/inputs/text").and_then(Value::as_str), Some("sunrise"));
        assert_eq!(workflow.pointer("/490/inputs/text").and_then(Value::as_str), Some("rain"));
        assert_eq!(workflow.pointer("/516/inputs/int").and_then(Value::as_u64), Some(640));
        assert_eq!(workflow.pointer("/518/inputs/int").and_then(Value::as_u64), Some(480));
    }
}

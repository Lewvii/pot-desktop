pub fn migrated_tts_list(list: &[String]) -> Option<Vec<String>> {
    if !list
        .iter()
        .any(|instance| instance.split('@').next() == Some("lingva_tts"))
    {
        return None;
    }
    let mut has_edge = list
        .iter()
        .any(|instance| instance.split('@').next() == Some("edge_tts"));
    let mut migrated = Vec::with_capacity(list.len());
    for instance in list {
        if instance.split('@').next() == Some("lingva_tts") {
            if !has_edge {
                migrated.push("edge_tts".into());
                has_edge = true;
            }
        } else {
            migrated.push(instance.clone());
        }
    }
    Some(migrated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(instances: &[&str]) -> Vec<String> {
        instances
            .iter()
            .map(|instance| (*instance).into())
            .collect()
    }

    #[test]
    fn replaces_bare_and_named_lingva_instances() {
        for instance in ["lingva_tts", "lingva_tts@custom"] {
            assert_eq!(
                migrated_tts_list(&list(&[instance])),
                Some(list(&["edge_tts"]))
            );
        }
    }

    #[test]
    fn replaces_multiple_lingva_instances_at_the_first_position() {
        assert_eq!(
            migrated_tts_list(&list(&[
                "plugin.first@custom",
                "lingva_tts@one",
                "plugin.second",
                "lingva_tts",
                "lingva_tts@two",
            ])),
            Some(list(&["plugin.first@custom", "edge_tts", "plugin.second"]))
        );
    }

    #[test]
    fn preserves_existing_edge_instances_and_surviving_order() {
        for edge in ["edge_tts", "edge_tts@custom"] {
            for original in [
                list(&[edge, "lingva_tts", "plugin.example@custom"]),
                list(&["lingva_tts@custom", edge, "plugin.example@custom"]),
            ] {
                assert_eq!(
                    migrated_tts_list(&original),
                    Some(list(&[edge, "plugin.example@custom"]))
                );
            }
            assert_eq!(
                migrated_tts_list(&list(&["lingva_tts", "plugin.example", edge])),
                Some(list(&["plugin.example", edge]))
            );
        }
    }

    #[test]
    fn matches_only_exact_builtin_provider_ids() {
        assert_eq!(
            migrated_tts_list(&list(&[
                "plugin.lingva_tts",
                "lingva_tts_extra",
                "plugin.example@lingva_tts",
                "edge_tts_extra",
                "lingva_tts",
            ])),
            Some(list(&[
                "plugin.lingva_tts",
                "lingva_tts_extra",
                "plugin.example@lingva_tts",
                "edge_tts_extra",
                "edge_tts",
            ]))
        );
    }

    #[test]
    fn leaves_empty_and_unrelated_lists_unchanged() {
        for original in [
            list(&[]),
            list(&["edge_tts"]),
            list(&["plugin.example@custom"]),
            list(&["edge_tts@one", "plugin.example", "edge_tts@two"]),
        ] {
            assert_eq!(migrated_tts_list(&original), None);
        }
    }

    #[test]
    fn repeated_migration_does_not_add_edge_or_request_a_write() {
        for original in [
            list(&["lingva_tts"]),
            list(&["lingva_tts@one", "plugin.example", "lingva_tts@two"]),
            list(&["lingva_tts", "plugin.example", "edge_tts@custom"]),
        ] {
            let migrated = migrated_tts_list(&original).unwrap();
            assert_eq!(migrated_tts_list(&migrated), None);
        }
    }
}

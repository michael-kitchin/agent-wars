# Example strategic response

One OpenRouter completion from a single strategic consultation, laid out for reading. The assistant message is the order envelope. The same consultation's prompt is [example-strategic-prompt.md](example-strategic-prompt.md). The field contract is [strategic-prompt.md](strategic-prompt.md) section 3, and [assembly-contract.md](assembly-contract.md) section 5. The builders under `src/main/openRouter/` win if this snapshot disagrees with them. This file is a reading copy of that one reply.

The capture stores the envelope as a string on `choices[0].message.content`. It is parsed and indented below. That body also carried an encrypted reasoning blob, which is left out.

The `memoryUpdates` write has no `content`. `write` in `src/main/tools/memory.ts` rejects empty content, so that row does not store a note.

## Completion

`google/gemini-3.5-flash-lite` from Google finished with `stop`. Token counts and cost:

```json
{
  "prompt_tokens": 21405,
  "completion_tokens": 850,
  "total_tokens": 22255,
  "cost": 0.0085465
}
```

## Order envelope

```json
{
  "message": "Your southern line will shatter into dust before our advancing might.",
  "strategy": "Execute coordinated air and naval strikes against enemy positions while advancing ground forces to crush enemy pockets.",
  "orders": [
    {
      "action": "explicit_move",
      "destination": "G5",
      "unitIds": [
        "a1-i1",
        "a1-t2"
      ]
    },
    {
      "action": "explicit_move",
      "destination": "GZ",
      "unitIds": [
        "a1-i2",
        "a1-i3",
        "a1-i17",
        "a1-t3",
        "a1-t4",
        "a1-t5"
      ]
    },
    {
      "action": "explicit_move",
      "destination": "J0",
      "unitIds": [
        "a1-i6",
        "a1-n7",
        "a1-n8",
        "a1-n9",
        "a1-n10"
      ]
    },
    {
      "action": "explicit_move",
      "destination": "FH",
      "unitId": "a1-i9"
    },
    {
      "action": "explicit_move",
      "destination": "LP",
      "unitId": "a1-i12"
    },
    {
      "action": "explicit_move",
      "destination": "FO",
      "unitIds": [
        "a1-i13",
        "a1-i14"
      ]
    },
    {
      "action": "explicit_move",
      "destination": "KQ",
      "unitIds": [
        "a1-n4",
        "a1-n5",
        "a1-n6"
      ]
    },
    {
      "action": "ranged_attack",
      "targetUnitId": "h1-i34",
      "unitIds": [
        "a1-n4",
        "a1-n5",
        "a1-n6",
        "a1-n10"
      ]
    },
    {
      "action": "ranged_attack",
      "targetUnitId": "h1-i32",
      "unitIds": [
        "a1-n7",
        "a1-n8",
        "a1-n9",
        "a1-n10"
      ]
    }
  ],
  "airStrikes": [
    {
      "targetType": "units",
      "targetHexCode": "LP",
      "unitIds": [
        "a1-a4",
        "a1-a5",
        "a1-a6",
        "a1-a7",
        "a1-a8"
      ]
    }
  ],
  "ferryOrders": [],
  "memoryUpdates": [
    {
      "action": "write",
      "key": "turn_objectives",
      "tier": "persistent"
    }
  ],
  "productionOrders": [
    {
      "action": "set_build_queue",
      "hex": "EJ",
      "unitType": "armor",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "FO",
      "unitType": "armor",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "ER",
      "unitType": "armor",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "EJ",
      "unitType": "armor",
      "count": 1
    }
  ]
}
```

# Example strategic response

One OpenRouter completion from opponent 1's latest strategic consultation, laid out for reading. The assistant message is the order envelope. The same consultation's prompt is [example-strategic-prompt.md](example-strategic-prompt.md). The field contract is [strategic-prompt.md](strategic-prompt.md) section 3, and [assembly-contract.md](assembly-contract.md) section 5. The builders under `src/main/openRouter/` win if this snapshot disagrees with them. This file is a reading copy of that one reply.

The capture stores the envelope as a string on `choices[0].message.content`. It is parsed and indented below. That body also carried an encrypted reasoning blob, which is left out.

## Completion

`google/gemini-3.5-flash-lite` from Google AI Studio finished with `stop`. Token counts and cost:

```json
{
  "prompt_tokens": 13722,
  "completion_tokens": 651,
  "total_tokens": 14373,
  "cost": 0.0037379933333333334
}
```

## Order envelope

```json
{
  "message": "Your Eastern territory will crumble before our advance.",
  "strategy": "Engage enemy forces at RE, establish air superiority, and set up production queues across all controlled urban hexes.",
  "orders": [
    {
      "action": "explicit_move",
      "unitIds": [
        "a1-i1",
        "a1-t1",
        "a1-t2"
      ],
      "destination": "RE"
    },
    {
      "action": "explicit_move",
      "unitId": "a1-n1",
      "destination": "RF"
    },
    {
      "action": "assign_order",
      "unitId": "a1-a1",
      "order": {
        "type": "defend",
        "defendHex": "SK"
      }
    }
  ],
  "airStrikes": [
    {
      "unitId": "a1-a1",
      "targetType": "units",
      "targetUnitId": "h1-a1"
    }
  ],
  "ferryOrders": [],
  "airDrops": [],
  "callbacks": [],
  "memoryUpdates": [
    {
      "action": "write",
      "key": "turn_objectives",
      "content": "Assault enemy air unit at RE with ground and air forces; secure production queues.",
      "tier": "persistent"
    }
  ],
  "productionOrders": [
    {
      "action": "set_build_queue",
      "hex": "SG",
      "unitType": "armor",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "PZ",
      "unitType": "armor",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "SK",
      "unitType": "air",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "PU",
      "unitType": "infantry",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "R7",
      "unitType": "naval",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "QY",
      "unitType": "infantry",
      "count": 1
    },
    {
      "action": "set_build_queue",
      "hex": "Q6",
      "unitType": "credits",
      "count": 1
    }
  ]
}
```

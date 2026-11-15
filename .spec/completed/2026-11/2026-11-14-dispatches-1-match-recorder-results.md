# Match recorder measurements

Measured by `buildFramePayload` then `encodeRecordPayload` on 2026-11-14, in one Node process. The regional match ran after the global match, so its time includes a warm module cache. The byte count is the deflate size of one frame payload, not the gzip size of a whole recording file.

| Match | Capture | Deflated frame |
| --- | ---: | ---: |
| Fresh global match (`withTempGameDb`) | 32.0 ms | 27,169 bytes |
| Region versus region (`withRegionVsRegionTempGameDb`) | 7.5 ms | 27,115 bytes |

One hundred fifty frames at the global size is about 3.9 MB compressed (27,169 × 150). The same count at the regional size is also about 3.9 MB (27,115 × 150). Both captures are under the 100 ms and 150 KB figures the meta-plan left for a decision after this work. The frame shape was not changed to chase those figures.

The app was not played. The manual checklist in the execution plan is still for a person to run.

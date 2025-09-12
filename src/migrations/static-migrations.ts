// Static migration imports for pkg bundling
// This file is used when running from a pkg binary to avoid dynamic imports

import { migration as migration001 } from "./001-consolidate-patterns.js";
import { migration as migration002 } from "./002-pattern-metadata-enrichment.js";
import { migration as migration003 } from "./003-add-pattern-aliases.js";
import migration004 from "./004-add-pattern-search-fields.js";
import { migration as migration005 } from "./005-add-pattern-provenance.js";
import { migration as migration006 } from "./006-add-task-system-schema.js";
import { migration as migration007 } from "./007-add-evidence-log-table.js";
import { migration008 } from "./008-add-pattern-metadata-fields.js";
import migration009 from "./009-populate-pattern-search-fields.js";
import { migration as migration010 } from "./010-add-task-tags.js";
import { migration as migration011 } from "./011-migrate-pattern-tags-to-json.js";
import { migration as migration012 } from "./012-rename-tags-csv-column.js";
import { migration as migration013 } from "./013-add-quality-metadata.js";
import { migration as migration014 } from "./014-populate-pattern-tags.js";
import { migration as migration015 } from "./015-project-isolation.js";
import { migration as migration016 } from "./016-add-missing-schema-tables.js";
import { migration as migration017 } from "./017-fix-fts-rowid-join.js";
import { migration018FixFtsTriggerSchema as migration018 } from "./018-fix-fts-trigger-schema.js";

export const staticMigrations = {
  "001-consolidate-patterns.js": migration001,
  "002-pattern-metadata-enrichment.js": migration002,
  "003-add-pattern-aliases.js": migration003,
  "004-add-pattern-search-fields.js": migration004,
  "005-add-pattern-provenance.js": migration005,
  "006-add-task-system-schema.js": migration006,
  "007-add-evidence-log-table.js": migration007,
  "008-add-pattern-metadata-fields.js": migration008,
  "009-populate-pattern-search-fields.js": migration009,
  "010-add-task-tags.js": migration010,
  "011-migrate-pattern-tags-to-json.js": migration011,
  "012-rename-tags-csv-column.js": migration012,
  "013-add-quality-metadata.js": migration013,
  "014-populate-pattern-tags.js": migration014,
  "015-project-isolation.js": migration015,
  "016-add-missing-schema-tables.js": migration016,
  "017-fix-fts-rowid-join.js": migration017,
  "018-fix-fts-trigger-schema.js": migration018,
};

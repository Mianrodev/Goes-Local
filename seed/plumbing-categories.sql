-- Plumbing site starter categories (2026-10-02): maps Google business types to plumbing categories.
-- Safe to re-run: INSERT OR IGNORE never overwrites what staff later change in Admin → Categories.
INSERT OR IGNORE INTO category_map(sub_slug,sub,main,updated_at) VALUES
('plumber','Plumber','Plumbers',0),
('plumbing-supply-store','Plumbing supply store','Plumbers',0),
('drainage-service','Drainage service','Drain Cleaning',0),
('sewer-service','Sewer service','Drain Cleaning',0),
('sewage-disposal-service','Sewage disposal service','Drain Cleaning',0),
('water-heater-installation-service','Water heater installation service','Water Heaters',0),
('water-heater-repair-service','Water heater repair service','Water Heaters',0),
('leak-detection-service','Leak detection service','Leak Detection',0),
('septic-system-service','Septic system service','Septic Services',0),
('water-damage-restoration-service','Water damage restoration service','Water Damage Restoration',0),
('water-softening-equipment-supplier','Water softening equipment supplier','Water Treatment',0),
('water-filter-supplier','Water filter supplier','Water Treatment',0),
('water-treatment-supplier','Water treatment supplier','Water Treatment',0),
('gas-installation-service','Gas installation service','Gas Lines',0),
('bathroom-remodeler','Bathroom remodeler','Bathroom & Kitchen',0),
('kitchen-remodeler','Kitchen remodeler','Bathroom & Kitchen',0),
('backflow-service','Backflow service','Plumbers',0),
('emergency-plumber','Emergency plumber','Plumbers',0);

-- Add board_status column to photos for potential/assigned tracking
ALTER TABLE photos ADD COLUMN board_status TEXT DEFAULT 'assigned'
  CHECK (board_status IN ('assigned', 'potential'));
CREATE INDEX idx_photos_board_status ON photos(board_id, board_status);

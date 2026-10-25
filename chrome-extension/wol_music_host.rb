#!/usr/bin/ruby
# Walk Of Life native messaging host for macOS Music; Ruby standard library only.
require 'json'
require 'open3'
require 'tmpdir'
require 'base64'
require 'fileutils'

DELIM = 31.chr
$last_art_key = nil
$last_art_data = nil

def read_exact(n)
  data = STDIN.read(n)
  return nil if data.nil? || data.bytesize != n
  data
end

def read_message
  header = read_exact(4)
  return nil unless header
  length = header.unpack('V')[0]
  return nil if length > 10_000_000
  payload = read_exact(length)
  return nil unless payload
  JSON.parse(payload) rescue {}
end

def write_message(message)
  data = JSON.generate(message).b
  STDOUT.write([data.bytesize].pack('V'))
  STDOUT.write(data)
  STDOUT.flush
end

def run_osascript(script, timeout_seconds = 8)
  stdout, stderr, status = Open3.capture3('/usr/bin/osascript', '-e', script)
  raise((stderr.to_s.strip.empty? ? 'AppleScript failed' : stderr.to_s.strip)) unless status.success?
  stdout.to_s.strip
end

def get_artwork(track_name, album_name)
  key = [track_name, album_name]
  return $last_art_data if key == $last_art_key
  $last_art_key = key
  $last_art_data = nil
  Dir.mktmpdir('wol-music-art-') do |td|
    raw_path = File.join(td, 'artwork.bin')
    jpg_path = File.join(td, 'artwork.jpg')
    escaped = raw_path.gsub('\\', '\\\\').gsub('"', '\\"')
    script = <<~APPLESCRIPT
      tell application "Music"
        if exists current track and (count of artworks of current track) > 0 then
          set artData to data of artwork 1 of current track
          set outFile to POSIX file "#{escaped}"
          set fileRef to open for access outFile with write permission
          set eof fileRef to 0
          write artData to fileRef
          close access fileRef
        end if
      end tell
    APPLESCRIPT
    begin
      run_osascript(script)
    rescue
      return nil
    end
    return nil unless File.file?(raw_path) && File.size(raw_path) > 0
    _out, _err, status = Open3.capture3('/usr/bin/sips', '-s', 'format', 'jpeg', '-Z', '500', raw_path, '--out', jpg_path)
    return nil unless status.success? && File.file?(jpg_path)
    data = File.binread(jpg_path)
    return nil if data.bytesize > 700_000
    $last_art_data = 'data:image/jpeg;base64,' + Base64.strict_encode64(data)
  end
  $last_art_data
end

def get_status
  script = <<~APPLESCRIPT
    tell application "Music"
      if not (exists current track) then
        return ""
      end if
      set t to current track
      set trackName to name of t as text
      set artistName to artist of t as text
      set albumName to album of t as text
      set stateName to player state as text
      set posVal to player position as text
      set durVal to duration of t as text
      return trackName & (ASCII character 31) & artistName & (ASCII character 31) & albumName & (ASCII character 31) & stateName & (ASCII character 31) & posVal & (ASCII character 31) & durVal
    end tell
  APPLESCRIPT
  raw = run_osascript(script)
  if raw.empty?
    return {'ok'=>true, 'track'=>'Nothing is playing', 'artist'=>'', 'album'=>'', 'state'=>'stopped', 'position'=>0, 'duration'=>0}
  end
  parts = raw.split(DELIM, -1)
  parts += [''] * (6 - parts.length)
  position = Float(parts[4].to_s.empty? ? '0' : parts[4]) rescue 0
  duration = Float(parts[5].to_s.empty? ? '0' : parts[5]) rescue 0
  artwork = parts[0].to_s.empty? ? nil : get_artwork(parts[0], parts[2])
  {'ok'=>true, 'track'=>parts[0], 'artist'=>parts[1], 'album'=>parts[2], 'state'=>parts[3].to_s.downcase, 'position'=>position, 'duration'=>duration, 'artwork'=>artwork}
end

def handle(msg)
  action = msg.is_a?(Hash) ? msg.fetch('action', 'status') : 'status'
  case action
  when 'status'
    get_status
  when 'playpause'
    run_osascript('tell application "Music" to playpause')
    get_status
  when 'next'
    run_osascript('tell application "Music" to next track')
    get_status
  when 'previous'
    run_osascript('tell application "Music" to previous track')
    get_status
  else
    {'ok'=>false, 'error'=>'Unknown command.'}
  end
end

STDIN.binmode
STDOUT.binmode
loop do
  msg = read_message
  break if msg.nil?
  begin
    response = handle(msg)
  rescue => e
    response = {'ok'=>false, 'error'=>e.message.to_s[0,500]}
  end
  write_message(response)
end

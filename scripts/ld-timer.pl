#!/usr/bin/env perl
use strict;
use warnings;
use File::Slurp 'slurp';
use Term::ReadKey;
use Time::HiRes 'time';

$| = 1;
ReadMode 3;
END { ReadMode 0 }

@ARGV == 2 || @ARGV == 3 or die "usage: startEpoch endEpochIncludingUploadHour [screenshotDir]\n";

my $start = shift;
my $end = shift;
my $screenshot_dir = shift;

my $duration = $end - $start;
my $devtime = r() || 0;
my $running = 1;

while (1) {
  my $now = time;
  while (1) {
    my $key = ReadKey(-1);
    last if !defined $key;
    $running = !$running if $key eq ' ';
  }

  if ($now >= $start && $running) {
    $devtime += 10;
    w($devtime);
  }

  render($now);

  if ($screenshot_dir) {
    system("/usr/sbin/screencapture -x /dev/null $screenshot_dir/@{[int $now]}.png 2>/dev/null");
  }
  sleep 10 - (time - $now);
}

sub render {
  my $now = shift;

  print "\e[2J\e[0;0H";
  my $progress = ($now - $start) / ($end - $start);
  my $column = int(49 * $progress);

  printf " devtime: %s  %s  realtime: %s / %s\n", fmt($devtime), $running ? '  …  ' : 'PAUSE', fmt($now - $start), fmt($end - $start, 1);

  for my $i (0..48) {
    if ($progress > $i/49) {
      print "#";
    }
    else {
      print ".";
    }
  }

  my $back = 49 - $column;
  $back = 0 if $back < 0;
  print "\e[${back}D";

}

sub fmt {
  my $s = shift;
  my $skipSign = shift;
  my $sign = $s < 0 ? "-" : " ";
  $sign = "" if $skipSign;

  $s = abs($s);

  my $m = int($s / 60);
  $s -= $m * 60;

  my $h = int($m / 60);
  $m -= $h * 60;

  sprintf "%s%02d:%02d", $sign, $h, $m;
}

sub r {
  slurp '.ld-time';
}

sub w {
  my $d = shift;

  open my $handle, '>', '.ld-time' or die $1;
  print $handle $d;
}


#!/usr/bin/env perl
use strict;
use warnings;
use File::Slurp 'slurp';
use Term::ReadKey;
use Time::HiRes 'time';

$| = 1;
ReadMode 3;
END { ReadMode 0 }

@ARGV == 2 || @ARGV == 3 or die "usage: startEpoch endEpoch [screenshotDir]\n";

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

  print "\e[2J\e[0;0H";
  my $progress = ($now - $start) / ($end - $start);
  my $column = int(49 * $progress);

  printf " devtime: %s     %s    realtime: %s / 49:00\n", fmt($devtime), $running ? '…' : '*', fmt($now - $start);

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

  if ($screenshot_dir && $now >= $start && $now <= $end) {
    system("/usr/sbin/screencapture -x /dev/null $screenshot_dir/@{[int $now]}.png 2>/dev/null");
  }
  sleep 10 - (time - $now);
}

sub fmt {
  my $s = shift;
  $s = 0 if $s < 0;

  my $m = int($s / 60);
  $s -= $m * 60;

  my $h = int($m / 60);
  $m -= $h * 60;

  sprintf "%02d:%02d", $h, $m;
}

sub r {
  slurp '.ld-time';
}

sub w {
  my $d = shift;

  open my $handle, '>', '.ld-time' or die $1;
  print $handle $d;
}


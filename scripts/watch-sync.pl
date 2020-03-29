#!/usr/bin/env perl
use strict;
use warnings;
use Filesys::Notify::Simple;
use File::Spec;

@ARGV == 2 || @ARGV == 3 or die "usage: $0 src dest [verbose]";

my $source = File::Spec->rel2abs(shift);
my $destination = shift;
my $verbose = shift;

my @excludes = (
  "build/",
  "node_modules/",
  ".git/",
);

my $watcher = Filesys::Notify::Simple->new([$source]);

my @ignore = map { File::Spec->catdir($source, $_) } @excludes;

if (my $syncpid = fork) {
  while (1) {
    $watcher->wait(sub {
      for (@_) {
        my $path = $_->{path};
        next if grep { rindex($path, $_, 0) == 0 } @ignore;

        warn "Syncing because file changed: " . File::Spec->abs2rel($path) . "\n" if $verbose;
        kill 'HUP', $syncpid;
        last;
      }
    });
  }
}
else {
  my @command = (
    "rsync",
    "--info=stats1",
    "--delete",
    "-az",
    (map { ("--exclude", $_) } @excludes),
    $source,
    $destination,
  );

  warn "Initial sync\n"
    if $verbose;
  system(@command);

  my $repeat = 0;
  while (1) {
    eval {
      local $SIG{HUP} = sub {
        $repeat = 1;
        warn "Scheduled fast followup sync\n"
          if $verbose;
      };

      unless ($repeat) {
        eval {
          local $SIG{HUP} = sub { die "HUP\n"; };
          sleep;
        };

        die $@ unless $@ eq "HUP\n";
      }

      $repeat = 0;

      warn "Syncing…\n"
        if $verbose;
      system(@command);
      warn "Sync complete\n"
        if $verbose;
    };

    die $@ if $@;
  }
}

